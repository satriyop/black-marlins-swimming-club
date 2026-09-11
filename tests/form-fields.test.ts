import { expect, test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Field, Input } from "../src/components/ui/input";

test("form helper text describes the control without changing its label", () => {
  const html = renderToStaticMarkup(
    createElement(Field, {
      label: "Interval (detik)",
      hint: "Jeda antarmulai.",
      children: createElement(Input, { type: "number" }),
    }),
  );
  const label = html.match(/<label[^>]*for="([^"]+)"[^>]*>(.*?)<\/label>/);
  expect(label?.[2]).toBe("Interval (detik)");
  expect(html).toContain(`id="${label?.[1]}"`);
  expect(html).toContain(`aria-describedby="${label?.[1]}-hint"`);
});
