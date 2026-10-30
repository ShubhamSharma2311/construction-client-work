import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApiError } from "../api/errors.ts";
import { FormError } from "./FormError.tsx";

const invalid = (path: string, message: string) =>
  new ApiError(400, "VALIDATION", "Request is not valid", "r", [{ path, message }]);

describe("FormError", () => {
  it("shows a refusal that names no field", () => {
    render(
      <FormError
        error={new ApiError(409, "CONFLICT", "Khet is inactive")}
        shownFields={["amount"]}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Khet is inactive.");
  });

  it("leaves a field's problem to that field", () => {
    const { container } = render(
      <FormError error={invalid("body/amount", "Too much")} shownFields={["amount"]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("lists a problem with a field the form does not show", () => {
    render(
      <FormError error={invalid("body", "Body must be an object")} shownFields={["amount"]} />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Body must be an object.");
  });

  it("shows nothing before a save fails", () => {
    const { container } = render(<FormError error={null} shownFields={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
