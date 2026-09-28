import { expect, test } from "vitest";
import { spectraSyncFeedback } from "../src/lib/club/spectra-sync-feedback";

const unchanged = {
  inserted: 0,
  updated: 0,
  skippedNoMeet: 0,
  skippedNoTime: 0,
  skippedNoDate: 0,
  skippedUnrecognized: 0,
};

test("reports a true no-change sync as success", () => {
  expect(spectraSyncFeedback(unchanged)).toEqual({
    kind: "success",
    message: "Sudah sinkron, tidak ada perubahan",
  });
});

test("reports imported and updated results as success", () => {
  expect(spectraSyncFeedback({ ...unchanged, inserted: 2, updated: 1 })).toEqual({
    kind: "success",
    message: "2 hasil baru, 1 hasil diperbarui dari Spectra SwimPro",
  });
});

test("warns when results are skipped instead of calling the sync unchanged", () => {
  expect(
    spectraSyncFeedback({
      ...unchanged,
      inserted: 1,
      skippedNoMeet: 2,
      skippedNoDate: 1,
    }),
  ).toEqual({
    kind: "warning",
    message: "1 hasil baru; 3 hasil Spectra dilewati dan perlu ditinjau",
  });
});
