import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Page from "../page";

describe("Home page", () => {
  it("renders the product name", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { name: /codelens/i })).toBeInTheDocument();
  });

  it("links to the GitHub repo", () => {
    render(<Page />);
    const link = screen.getByRole("link", { name: /view source/i });
    expect(link).toHaveAttribute("href", "https://github.com/Unkx/AI-Code-Reviewer");
  });
});
