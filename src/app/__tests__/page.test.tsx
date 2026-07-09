import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Page from "../page";

describe("Home page", () => {
  it("renders the product name", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { name: /codelens/i })).toBeInTheDocument();
  });

  it("links to the GitHub App install page", () => {
    process.env.NEXT_PUBLIC_GITHUB_APP_SLUG = "codelens-review";
    render(<Page />);
    const link = screen.getByRole("link", { name: /install/i });
    expect(link).toHaveAttribute("href", "https://github.com/apps/codelens-review/installations/new");
  });
});
