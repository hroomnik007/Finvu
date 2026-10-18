import { expect, it } from "vitest";
import { escapeLike } from "./search";

it("escapes LIKE wildcards and the escape character", () => {
  expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  expect(escapeLike("nájom")).toBe("nájom");
});
