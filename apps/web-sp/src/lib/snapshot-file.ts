/**
 * Snapshot a File into a new File backed by an in-memory buffer.
 *
 * Why: replace-plan used to call window.confirm inside the <input type=file>
 * change handler after clearing the input. Yielding to the browser (dialog /
 * await) after the input is cleared can make the original File unreadable
 * (NotReadableError) — prepare fails, uploadHint only rendered on no_map, so
 * the salesperson sees nothing and the DB never changes.
 *
 * Always call this (or arrayBuffer) before any other await when the File came
 * from a file input.
 */
export async function snapshotFile(file: File): Promise<File> {
  const buf = await file.arrayBuffer();
  return new File([buf], file.name, {
    type: file.type || "application/octet-stream",
    lastModified: file.lastModified,
  });
}
