import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { EnrollmentProgress } from "./EnrollmentProgress";
afterEach(cleanup);
it("shows model loading, actual sample progress, saving and completion", () => {
  const { rerender } = render(
    <EnrollmentProgress phase="loading" progress={0} />,
  );
  expect(screen.getByRole("progressbar").hasAttribute("value")).toBe(false);
  expect(screen.getByRole("status").textContent).toContain("加载");
  rerender(<EnrollmentProgress phase="sampling" progress={0.4} />);
  expect(screen.getByRole("progressbar").getAttribute("value")).toBe("0.4");
  expect(screen.getByRole("status").textContent).toContain("4/10");
  rerender(<EnrollmentProgress phase="saving" progress={1} />);
  expect(screen.getByRole("status").textContent).toContain("正在保存");
  rerender(<EnrollmentProgress phase="complete" progress={1} />);
  expect(screen.getByRole("status").textContent).toContain("录入完成");
});
