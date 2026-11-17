import { expect, test } from "@playwright/test";

const PASSWORD = "Passw0rd!";

test("merchant applies for a loan, reviewer approves and disburses it", async ({ page }) => {
  const stamp = Date.now();
  const business = `Acme Bakery ${stamp}`;

  // 1. A new merchant registers
  await page.goto("/");
  await page.getByRole("button", { name: "New merchant? Create an account" }).click();
  await page.getByLabel("Name").fill("Test Merchant");
  await page.getByLabel("Email").fill(`merchant+${stamp}@test.com`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // 2. An ineligible request shows the reasons in the live quote
  await page.getByLabel("Business name").fill(business);
  await page.getByLabel("Loan amount").fill("5000000");
  await page.getByLabel("Tenure").fill("12");
  await page.getByLabel("Monthly revenue").fill("200000");
  await page.getByLabel("Years in business").fill("4");
  await expect(page.getByTestId("quote")).toContainText("cannot exceed 6x monthly revenue");

  // 3. Fixing the amount shows the rate and EMI, then the merchant applies
  await page.getByLabel("Loan amount").fill("500000");
  await expect(page.getByTestId("quote")).toContainText("12.00% p.a.");
  await page.getByRole("button", { name: "Submit application" }).click();
  const merchantRow = page.getByRole("row", { name: new RegExp(business) });
  await expect(merchantRow).toContainText("submitted");

  // 4. The reviewer logs in and moves it through the workflow
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByLabel("Email").fill("reviewer@demo.com");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByLabel("Search business").fill(String(stamp));
  await page.getByRole("row", { name: new RegExp(business) }).getByRole("button", { name: "View" }).click();
  const details = page.getByRole("region", { name: "Application details" });
  const title = details.getByRole("heading", { level: 2 });
  await expect(title).toContainText(business);

  await details.getByRole("button", { name: "Start review" }).click();
  await expect(title).toContainText("under review");
  await details.getByLabel("Note").fill("Revenue verified");
  await details.getByRole("button", { name: "Approve" }).click();
  await expect(title).toContainText("approved");
  await details.getByRole("button", { name: "Disburse" }).click();
  await expect(title).toContainText("disbursed");

  // 5. The audit trail and the repayment schedule are shown
  await expect(details.getByRole("listitem")).toHaveCount(4);
  await expect(details.getByText("“Revenue verified”")).toBeVisible();
  await expect(details.locator("tbody tr")).toHaveCount(12);
  await expect(page.getByRole("row", { name: new RegExp(business) })).toContainText("disbursed");
});
