/**
 * The single place the frontend talks to the backend.
 *
 * This file is the handover seam made concrete: every network call goes through
 * here, so a dev team reimplementing /api/* in Python or PHP changes the server
 * and nothing else. See docs/02-architecture-and-stack.md ADR-002.
 */

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    // Session cookie must ride along.
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let code = "unknown";
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      code = body.error ?? code;
      message = body.message ?? message;
    } catch {
      /* non-JSON error body; keep the status text */
    }
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export type Project = {
  id: string;
  name: string;
  client: string | null;
  venue: string | null;
  city: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  vcDays: number | null;
  opsDays: number | null;
  defaultRunningHoursPerDay: number | null;
  status: string;
  ownerId: string;
  organisationId: string;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MapState = "no_map" | "map_uncalibrated" | "calibrated";

export type BaseMapDto = {
  id: string;
  mimeType: string;
  widthPx: number;
  heightPx: number;
  pageCount: number | null;
  sourcePage: number;
  uploadedAt: string;
  viewUrl: string | null;
  calibration: {
    pointA: { x: number; y: number };
    pointB: { x: number; y: number };
    knownDistance: number;
    knownUnit: string;
    calibratedAt: string | null;
    calibratedById: string | null;
  } | null;
  scale: { mmPerPixel: number } | null;
  impliedWidthM: number | null;
};

export type LayoutPayload = {
  layout: { id: string; name: string; projectId: string };
  level: { id: string; name: string; ordinal: number };
  baseMap: BaseMapDto | null;
  mapState: MapState;
  variants: LayoutVariant[];
  instances: LayoutInstance[];
  measurements: LayoutMeasurement[];
  showItems: LayoutShowItem[];
};

export type CataloguePackage = {
  packageId: string;
  name: string;
  description: string | null;
  params: string[];
  version: number;
  auto: boolean;
  category: string | null;
  lines: {
    itemCode: string;
    itemName: string;
    qtyRule: string;
    qtyValue: number;
    flag: string;
  }[];
};

export type CatalogueShowItem = {
  code: string;
  name: string;
  category: string;
  unit: string;
};

export type LayoutShowItem = {
  id: string;
  itemCode: string;
  name: string;
  category: string;
  unit: string;
  qty: number;
  params: Record<string, number>;
};

export type LayoutVariant = {
  id: string;
  packageId: string;
  name: string;
  templateVersion: number;
  instanceCount: number;
  lines: {
    itemCode: string;
    itemName: string;
    qtyRule: string;
    qtyValue: number;
    flag: string;
    included: boolean;
  }[];
};

export type LayoutInstance = {
  id: string;
  variantId: string;
  xPx: number;
  yPx: number;
  widthPx: number | null;
  heightPx: number | null;
  rotationDeg: number;
  params: Record<string, number>;
  runningHoursPerDay: number | null;
};

/** Pixel geometry only. Length is derived from the current scale. */
export type LayoutMeasurement = {
  id: string;
  points: { x: number; y: number }[];
};

export const api = {
  version: () => request<{ name: string; version: string; commit: string }>("/api/version"),
  ready: () => request<{ ok: boolean; db: string }>("/readyz"),
  me: () =>
    request<{ id: string; email: string; name: string; role: string; organisationId: string }>(
      "/api/auth/me",
    ),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  projects: {
    list: () => request<{ projects: Project[] }>("/api/projects"),
    create: (name: string) =>
      request<Project>("/api/projects", { method: "POST", body: JSON.stringify({ name }) }),
    get: (id: string) => request<Project>(`/api/projects/${id}`),
    archive: (id: string) =>
      request<Project>(`/api/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "ARCHIVED" }),
      }),
    layout: (id: string) => request<LayoutPayload>(`/api/projects/${id}/layout`),
    basemapPresign: (id: string, body: { mimeType: string; byteSize: number; fileName?: string }) =>
      request<{
        objectKey: string;
        uploadUrl: string;
        headers: Record<string, string>;
        maxBytes: number;
      }>(`/api/projects/${id}/basemap/presign`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    basemapConfirm: (
      id: string,
      body: {
        objectKey: string;
        mimeType: string;
        widthPx: number;
        heightPx: number;
        pageCount?: number | null;
        sourcePage?: number;
      },
    ) =>
      request<{ baseMap: BaseMapDto; mapState: MapState; calibrationCleared: boolean }>(
        `/api/projects/${id}/basemap/confirm`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    calibrate: (
      id: string,
      body: {
        pointA: { x: number; y: number };
        pointB: { x: number; y: number };
        knownDistance: number;
        knownUnit: string;
        acceptImplausible?: boolean;
      },
    ) =>
      request<{
        baseMap: BaseMapDto;
        mapState: MapState;
        impliedWidthM: number;
        implausible: boolean;
      }>(`/api/projects/${id}/basemap/calibration`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    placeInstance: (
      id: string,
      body: {
        id?: string;
        packageId: string;
        xPx: number;
        yPx: number;
        widthPx?: number;
        heightPx?: number;
        rotationDeg?: number;
        params?: Record<string, number>;
      },
    ) =>
      request<{ instance: LayoutInstance; variant: LayoutVariant }>(
        `/api/projects/${id}/instances`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    patchInstance: (projectId: string, instanceId: string, body: Partial<LayoutInstance>) =>
      request<{ instance: LayoutInstance }>(
        `/api/projects/${projectId}/instances/${instanceId}`,
        { method: "PATCH", body: JSON.stringify(body) },
      ),
    deleteInstance: (projectId: string, instanceId: string) =>
      request<void>(`/api/projects/${projectId}/instances/${instanceId}`, { method: "DELETE" }),
    placeMeasurement: (
      id: string,
      body: { id?: string; points: { x: number; y: number }[] },
    ) =>
      request<{ measurement: LayoutMeasurement }>(`/api/projects/${id}/measurements`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    deleteMeasurement: (projectId: string, measurementId: string) =>
      request<void>(`/api/projects/${projectId}/measurements/${measurementId}`, { method: "DELETE" }),
    addShowItem: (id: string, body: { itemCode: string; qty?: number }) =>
      request<{ showItem: LayoutShowItem }>(`/api/projects/${id}/show-items`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    patchShowItem: (projectId: string, showItemId: string, body: { qty: number }) =>
      request<{ showItem: LayoutShowItem }>(
        `/api/projects/${projectId}/show-items/${showItemId}`,
        { method: "PATCH", body: JSON.stringify(body) },
      ),
    deleteShowItem: (projectId: string, showItemId: string) =>
      request<void>(`/api/projects/${projectId}/show-items/${showItemId}`, { method: "DELETE" }),
  },
  catalogue: {
    packages: () =>
      request<{ packages: CataloguePackage[]; showItems: CatalogueShowItem[] }>("/api/catalogue/packages"),
  },
};

/** Direct PUT to R2 — never through the app server. */
export async function putToPresignedUrl(
  uploadUrl: string,
  blob: Blob,
  headers: Record<string, string>,
  onProgress?: (ratio: number) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new ApiError(xhr.status, "upload_failed", `R2 upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new ApiError(0, "upload_failed", "R2 upload network error"));
    xhr.send(blob);
  });
}
