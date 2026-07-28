import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { CreateBoardActionState } from "./actions/create-board";
import { CreateBoardForm } from "./create-board-form";

it("lets the owner choose a template and submit it accessibly", async () => {
  const user = userEvent.setup();
  const action = vi.fn<
    (
      previous: CreateBoardActionState,
      formData: FormData,
    ) => Promise<CreateBoardActionState>
  >(async () => ({
      status: "error",
      message: "테스트 응답",
    }));

  render(<CreateBoardForm createBoardAction={action} />);

  expect(
    screen.getByRole("radio", { name: /행사 안내/ }),
  ).toBeChecked();
  await user.click(screen.getByRole("radio", { name: /매장 안내/ }));
  await user.click(screen.getByRole("button", { name: "안내판 만들기" }));

  expect(action).toHaveBeenCalled();
  const submitted = action.mock.calls[0]?.[1] as FormData;
  expect(submitted.get("template")).toBe("store");
  expect(await screen.findByRole("alert")).toHaveTextContent("테스트 응답");
  expect(
    screen.getByRole("link", { name: "대시보드로 돌아가기" }),
  ).toHaveAttribute("href", "/dashboard");
});
