/**
 * BOQ tab — the live bill of quantities for the project's layout.
 *
 * Reads GET /api/projects/:id/boq (quantities only; there is no money in this
 * repo). Findings come first, then lines grouped by section. Quantities follow
 * the design's numeric emphasis rule (`.numeric`).
 *
 * Not a quote: it derives from the layout, and an uncalibrated layout yields
 * findings instead of invented numbers.
 */
import { useState } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Badge, Button, Section, SectionHeader } from "./primitives.js";
import { api, type BoqFinding } from "../lib/api.js";
import { boqQueryKey, queryClient } from "../lib/boq-query.js";
import {
  csvFilename,
  groupBySection,
  orderFindings,
  toCsv,
} from "../lib/boq-panel.js";

export interface BoqPanelProps {
  projectId: string;
  projectName: string;
}

const SEVERITY_TONE: Record<BoqFinding["severity"], "orange" | "blue" | "ink"> = {
  error: "orange",
  warning: "blue",
  info: "ink",
};

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function BoqPanelContent({ projectId, projectName }: BoqPanelProps) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: boqQueryKey(projectId),
    queryFn: () => api.boq.get(projectId),
  });
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (isPending) {
    return <p className="panel-hint" aria-busy="true">Building the BOQ…</p>;
  }
  if (isError) {
    return (
      <p className="panel-hint" role="alert">
        {error instanceof Error ? error.message : "Could not build the BOQ."}
      </p>
    );
  }

  const findings = orderFindings(data.findings);
  const groups = groupBySection(data.lines);

  return (
    <div className="boq-panel">
      {findings.length > 0 ? (
        <Section>
          <SectionHeader title="Findings" />
          <ul className="boq-findings">
            {findings.map((f, i) => (
              <li key={`${f.code}-${i}`} className="boq-findings__row">
                <Badge tone={SEVERITY_TONE[f.severity]}>{f.severity}</Badge>
                <span className="boq-findings__message">{f.message}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div className="boq-panel__actions">
        <Button
          size="sm"
          onClick={() => downloadCsv(csvFilename(projectName), toCsv(data.lines))}
        >
          Download CSV
        </Button>
      </div>

      {groups.map((group) => (
        <Section key={group.section}>
          <SectionHeader title={group.label} />
          <ul className="boq-lines">
            {group.lines.map((line) => {
              const expanded = open[line.itemCode] === true;
              const count = line.contributions.length;
              return (
                <li key={line.itemCode} className="boq-line">
                  <div className="boq-line__head">
                    <span className="boq-line__name">{line.name}</span>
                    <span className="boq-line__code">{line.itemCode}</span>
                  </div>
                  <div className="boq-line__qty">
                    <span className="numeric">{line.qty}</span>
                    <span className="boq-line__unit">{line.unit}</span>
                    <button
                      type="button"
                      className="boq-line__contrib"
                      aria-expanded={expanded}
                      onClick={() =>
                        setOpen((prev) => ({ ...prev, [line.itemCode]: !prev[line.itemCode] }))
                      }
                    >
                      {count} {count === 1 ? "contribution" : "contributions"}
                    </button>
                  </div>
                  {expanded ? (
                    <ul className="boq-line__contribs">
                      {line.contributions.map((c, i) => (
                        <li key={`${c.instanceId ?? c.showItemId ?? i}`}>
                          {c.variantName}
                          {c.showItemId ? " (show item)" : ""}:{" "}
                          <span className="numeric">{c.qty}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Section>
      ))}

      {data.lines.length === 0 ? (
        <p className="panel-hint">No quantities yet. Place a package to build the BOQ.</p>
      ) : null}
    </div>
  );
}

export function BoqPanel(props: BoqPanelProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <BoqPanelContent {...props} />
    </QueryClientProvider>
  );
}
