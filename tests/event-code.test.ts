import { expect, test } from "vitest";
import { eventCode, strokeShort } from "../src/lib/swim/constants";

test("eventCode uses spoken stroke names, not letter ciphers", () => {
  expect(eventCode(50, "bebas")).toBe("50 Bebas");
  expect(eventCode(100, "punggung")).toBe("100 Punggung");
  expect(eventCode(50, "dada")).toBe("50 Dada");
  expect(eventCode(50, "kupu")).toBe("50 Kupu");
  expect(eventCode(200, "ganti")).toBe("200 Ganti");
});

test("eventCode names the pool in Indonesian when course is set", () => {
  expect(eventCode(50, "bebas", "50")).toBe("50 Bebas · kolam 50 m");
  expect(eventCode(100, "punggung", "25")).toBe("100 Punggung · kolam 25 m");
});

test("strokeShort is the spoken word used in eventCode", () => {
  expect(strokeShort("bebas")).toBe("Bebas");
  expect(strokeShort("punggung")).toBe("Punggung");
});
