import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import Home from "../page";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeApiResponse(body: object, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

const HAPPY_RESULT = {
  languageMismatch: false,
  detectedLanguage: "TypeScript",
  bugs: ["Missing null check"],
  quality: ["Function too long"],
  security: ["Potential XSS"],
  suggestions: ["Add types"],
  fixedCode: "const x: number = 1;",
};

const EMPTY_RESULT = {
  languageMismatch: false,
  detectedLanguage: "TypeScript",
  bugs: [],
  quality: [],
  security: [],
  suggestions: [],
  fixedCode: null,
};

describe("Home page", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    mockFetch.mockReset();
  });

  // ---------------------------------------------------------------------------
  // Initial render
  // ---------------------------------------------------------------------------
  it("renders heading and key UI elements", () => {
    render(<Home />);
    expect(screen.getByText("Code Review")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/paste your code/i)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /language/i })).toBeInTheDocument();
  });

  it("defaults language to TypeScript", () => {
    render(<Home />);
    const select = screen.getByRole("combobox", { name: /language/i });
    expect(select).toHaveValue("TypeScript");
  });

  it("lists all supported languages in the dropdown", () => {
    render(<Home />);
    const select = screen.getByRole("combobox", { name: /language/i });
    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual([
      "JavaScript", "TypeScript", "Python", "Java", "C#", "C++", "Go", "Rust", "Other",
    ]);
  });

  // ---------------------------------------------------------------------------
  // Button enabled / disabled
  // ---------------------------------------------------------------------------
  it("Run Review button is disabled with no code", () => {
    render(<Home />);
    expect(screen.getByRole("button", { name: /run review/i })).toBeDisabled();
  });

  it("Run Review button is disabled with whitespace-only code", async () => {
    render(<Home />);
    await user.type(screen.getByPlaceholderText(/paste your code/i), "   ");
    expect(screen.getByRole("button", { name: /run review/i })).toBeDisabled();
  });

  it("Run Review button enables when code is non-empty", async () => {
    render(<Home />);
    await user.type(screen.getByPlaceholderText(/paste your code/i), "const x = 1;");
    expect(screen.getByRole("button", { name: /run review/i })).toBeEnabled();
  });

  // ---------------------------------------------------------------------------
  // Fetch / loading
  // ---------------------------------------------------------------------------
  it("calls fetch with code and language on submit", async () => {
    mockFetch.mockReturnValue(makeApiResponse(EMPTY_RESULT));
    render(<Home />);
    await user.type(screen.getByPlaceholderText(/paste your code/i), "const x = 1;");
    await user.selectOptions(screen.getByRole("combobox", { name: /language/i }), "JavaScript");
    await user.click(screen.getByRole("button", { name: /run review/i }));

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/review");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.code).toBe("const x = 1;");
    expect(body.language).toBe("JavaScript");
  });

  it("shows Analyzing… while fetch is in flight", async () => {
    let resolve!: (v: Response) => void;
    mockFetch.mockReturnValue(new Promise<Response>((r) => { resolve = r; }));

    render(<Home />);
    await user.type(screen.getByPlaceholderText(/paste your code/i), "x");
    await user.click(screen.getByRole("button", { name: /run review/i }));

    expect(screen.getByText(/analyzing/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analyzing/i })).toBeDisabled();

    resolve(new Response(JSON.stringify(EMPTY_RESULT), { status: 200, headers: { "Content-Type": "application/json" } }));
    await waitFor(() => expect(screen.queryByText(/analyzing/i)).not.toBeInTheDocument());
  });

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------
  it("shows error message from API error field", async () => {
    mockFetch.mockReturnValue(makeApiResponse({ error: "Service not configured" }, 503));
    render(<Home />);
    await user.type(screen.getByPlaceholderText(/paste your code/i), "x");
    await user.click(screen.getByRole("button", { name: /run review/i }));
    await waitFor(() => expect(screen.getByText(/service not configured/i)).toBeInTheDocument());
  });

  it("shows generic error message on network failure", async () => {
    mockFetch.mockRejectedValue(new Error("Failed to fetch"));
    render(<Home />);
    await user.type(screen.getByPlaceholderText(/paste your code/i), "x");
    await user.click(screen.getByRole("button", { name: /run review/i }));
    await waitFor(() => expect(screen.getByText(/failed to fetch/i)).toBeInTheDocument());
  });

  it("clears previous error on new submission", async () => {
    mockFetch.mockRejectedValueOnce(new Error("First error"));
    mockFetch.mockReturnValueOnce(makeApiResponse(EMPTY_RESULT));

    render(<Home />);
    await user.type(screen.getByPlaceholderText(/paste your code/i), "x");
    await user.click(screen.getByRole("button", { name: /run review/i }));
    await waitFor(() => expect(screen.getByText(/first error/i)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /run review/i }));
    await waitFor(() => expect(screen.queryByText(/first error/i)).not.toBeInTheDocument());
  });

  // ---------------------------------------------------------------------------
  // Happy-path results
  // ---------------------------------------------------------------------------
  it("renders result sections with findings", async () => {
    mockFetch.mockReturnValue(makeApiResponse(HAPPY_RESULT));
    render(<Home />);
    await user.type(screen.getByPlaceholderText(/paste your code/i), "const x = 1;");
    await user.click(screen.getByRole("button", { name: /run review/i }));

    await waitFor(() => expect(screen.getByText("Missing null check")).toBeInTheDocument());
    expect(screen.getByText("Function too long")).toBeInTheDocument();
    expect(screen.getByText("Potential XSS")).toBeInTheDocument();
    expect(screen.getByText("Add types")).toBeInTheDocument();
  });

  it("shows total findings count", async () => {
    mockFetch.mockReturnValue(makeApiResponse(HAPPY_RESULT));
    render(<Home />);
    await user.type(screen.getByPlaceholderText(/paste your code/i), "const x = 1;");
    await user.click(screen.getByRole("button", { name: /run review/i }));

    // 1 bug + 1 quality + 1 security + 1 suggestion = 4 findings
    await waitFor(() => expect(screen.getByText(/4 findings/i)).toBeInTheDocument());
  });

  it("shows singular 'finding' when count is 1", async () => {
    mockFetch.mockReturnValue(makeApiResponse({
      ...EMPTY_RESULT,
      bugs: ["one bug"],
    }));
    render(<Home />);
    await user.type(screen.getByPlaceholderText(/paste your code/i), "x");
    await user.click(screen.getByRole("button", { name: /run review/i }));
    await waitFor(() => expect(screen.getByText(/1 finding(?!s)/)).toBeInTheDocument());
  });

  it("does not show sections with empty arrays", async () => {
    mockFetch.mockReturnValue(makeApiResponse(EMPTY_RESULT));
    render(<Home />);
    await user.type(screen.getByPlaceholderText(/paste your code/i), "x");
    await user.click(screen.getByRole("button", { name: /run review/i }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(screen.queryByText(/^Bugs$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Security$/i)).not.toBeInTheDocument();
  });

  it("shows Proposed Fix block when fixedCode present", async () => {
    mockFetch.mockReturnValue(makeApiResponse(HAPPY_RESULT));
    render(<Home />);
    await user.type(screen.getByPlaceholderText(/paste your code/i), "const x = 1;");
    await user.click(screen.getByRole("button", { name: /run review/i }));

    await waitFor(() => expect(screen.getByText("Proposed Fix")).toBeInTheDocument());
    expect(screen.getByText("const x: number = 1;")).toBeInTheDocument();
  });

  it("does not show Proposed Fix when fixedCode is null", async () => {
    mockFetch.mockReturnValue(makeApiResponse(EMPTY_RESULT));
    render(<Home />);
    await user.type(screen.getByPlaceholderText(/paste your code/i), "x");
    await user.click(screen.getByRole("button", { name: /run review/i }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(screen.queryByText("Proposed Fix")).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Apply fix
  // ---------------------------------------------------------------------------
  it("Apply button replaces textarea content with fixedCode", async () => {
    mockFetch.mockReturnValue(makeApiResponse(HAPPY_RESULT));
    render(<Home />);
    const textarea = screen.getByPlaceholderText(/paste your code/i);
    await user.type(textarea, "const x = 1;");
    await user.click(screen.getByRole("button", { name: /run review/i }));

    await waitFor(() => expect(screen.getByText("Proposed Fix")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /^apply$/i }));

    expect(textarea).toHaveValue("const x: number = 1;");
  });

  it("Apply button shows Applied feedback temporarily", async () => {
    mockFetch.mockReturnValue(makeApiResponse(HAPPY_RESULT));
    render(<Home />);
    await user.type(screen.getByPlaceholderText(/paste your code/i), "const x = 1;");
    await user.click(screen.getByRole("button", { name: /run review/i }));

    await waitFor(() => expect(screen.getByText("Proposed Fix")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /^apply$/i }));

    expect(screen.getByRole("button", { name: /applied/i })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Copy fix
  // ---------------------------------------------------------------------------
  it("Copy button writes fixedCode to clipboard", async () => {
    mockFetch.mockReturnValue(makeApiResponse(HAPPY_RESULT));
    render(<Home />);
    await user.type(screen.getByPlaceholderText(/paste your code/i), "const x = 1;");
    await user.click(screen.getByRole("button", { name: /run review/i }));

    await waitFor(() => expect(screen.getByText("Proposed Fix")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /^copy$/i }));

    const clipboardText = await navigator.clipboard.readText();
    expect(clipboardText).toBe("const x: number = 1;");
  });

  it("Copy button shows Copied feedback after click", async () => {
    mockFetch.mockReturnValue(makeApiResponse(HAPPY_RESULT));
    render(<Home />);
    await user.type(screen.getByPlaceholderText(/paste your code/i), "const x = 1;");
    await user.click(screen.getByRole("button", { name: /run review/i }));

    await waitFor(() => expect(screen.getByText("Proposed Fix")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /^copy$/i }));

    expect(screen.getByRole("button", { name: /copied/i })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Language mismatch
  // ---------------------------------------------------------------------------
  it("shows mismatch warning instead of results when languageMismatch is true", async () => {
    mockFetch.mockReturnValue(makeApiResponse({
      languageMismatch: true,
      detectedLanguage: "Python",
      bugs: [], quality: [], security: [], suggestions: [], fixedCode: null,
    }));
    render(<Home />);
    await user.type(screen.getByPlaceholderText(/paste your code/i), "print('hi')");
    await user.click(screen.getByRole("button", { name: /run review/i }));

    await waitFor(() => expect(screen.getByText(/did you mean python/i)).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: /^bugs$/i })).not.toBeInTheDocument();
  });

  it("switch-language button changes the select and clears the result", async () => {
    mockFetch.mockReturnValue(makeApiResponse({
      languageMismatch: true,
      detectedLanguage: "Python",
      bugs: [], quality: [], security: [], suggestions: [], fixedCode: null,
    }));
    render(<Home />);
    await user.type(screen.getByPlaceholderText(/paste your code/i), "print('hi')");
    await user.click(screen.getByRole("button", { name: /run review/i }));

    await waitFor(() => expect(screen.getByText(/switch to python/i)).toBeInTheDocument());
    await user.click(screen.getByText(/switch to python/i));

    expect(screen.getByRole("combobox", { name: /language/i })).toHaveValue("Python");
    expect(screen.queryByText(/did you mean/i)).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Line count display
  // ---------------------------------------------------------------------------
  it("shows line count when code is present", async () => {
    render(<Home />);
    await user.type(screen.getByPlaceholderText(/paste your code/i), "line1\nline2\nline3");
    expect(screen.getByText(/3 lines/i)).toBeInTheDocument();
  });
});
