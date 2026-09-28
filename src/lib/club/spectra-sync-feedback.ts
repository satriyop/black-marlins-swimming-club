type SpectraSyncSummary = {
  inserted: number;
  updated: number;
  skippedNoMeet: number;
  skippedNoTime: number;
  skippedNoDate: number;
  skippedUnrecognized: number;
};

export function spectraSyncFeedback(summary: SpectraSyncSummary): {
  kind: "success" | "warning";
  message: string;
} {
  const changes = [
    summary.inserted > 0 ? `${summary.inserted} hasil baru` : null,
    summary.updated > 0 ? `${summary.updated} hasil diperbarui` : null,
  ].filter((part): part is string => part != null);
  const skipped =
    summary.skippedNoMeet +
    summary.skippedNoTime +
    summary.skippedNoDate +
    summary.skippedUnrecognized;

  if (skipped > 0) {
    const changeMessage = changes.length > 0 ? `${changes.join(", ")}; ` : "";
    return {
      kind: "warning",
      message: `${changeMessage}${skipped} hasil Spectra dilewati dan perlu ditinjau`,
    };
  }

  return {
    kind: "success",
    message:
      changes.length > 0
        ? `${changes.join(", ")} dari Spectra SwimPro`
        : "Sudah sinkron, tidak ada perubahan",
  };
}
