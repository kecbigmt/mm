import { assertEquals, assertStringIncludes } from "@std/assert";
import { App } from "fresh";
import type { State } from "../../utils.ts";
import { handler } from "./[date].tsx";
import { InMemoryItemRepository } from "../../../src/domain/repositories/item_repository_fake.ts";
import { createItem } from "../../../src/domain/models/item.ts";
import { parseItemId } from "../../../src/domain/primitives/item_id.ts";
import { parseItemTitle } from "../../../src/domain/primitives/item_title.ts";
import { parseItemIcon } from "../../../src/domain/primitives/item_icon.ts";
import { parseItemStatus } from "../../../src/domain/primitives/item_status.ts";
import { parsePlacement } from "../../../src/domain/primitives/placement.ts";
import { parseItemRank } from "../../../src/domain/primitives/item_rank.ts";
import { parseDateTime } from "../../../src/domain/primitives/date_time.ts";
import { parseTimezoneIdentifier } from "../../../src/domain/primitives/timezone_identifier.ts";
import { Result } from "../../../src/shared/result.ts";

const createTestItem = (opts: {
  id: string;
  title: string;
  placement: string;
  rank: string;
}) => {
  return createItem({
    id: Result.unwrap(parseItemId(opts.id)),
    title: Result.unwrap(parseItemTitle(opts.title)),
    icon: Result.unwrap(parseItemIcon("note")),
    status: Result.unwrap(parseItemStatus("open")),
    placement: Result.unwrap(parsePlacement(opts.placement)),
    rank: Result.unwrap(parseItemRank(opts.rank)),
    createdAt: Result.unwrap(parseDateTime("2026-02-04T10:00:00Z")),
    updatedAt: Result.unwrap(parseDateTime("2026-02-04T10:00:00Z")),
  });
};

Deno.test("[date].tsx", async (t) => {
  const emptyRepo = new InMemoryItemRepository();
  const timezone = Result.unwrap(parseTimezoneIdentifier("UTC"));

  const appWithEmptyRepo = new App<State>()
    .use((ctx) => {
      ctx.state.itemRepository = emptyRepo;
      ctx.state.timezone = timezone;
      return ctx.next();
    })
    .get("/d/:date", handler.GET)
    .handler();

  await t.step(
    "GET /d/2026-02-04 returns 200 with date in response",
    async () => {
      const req = new Request("http://localhost/d/2026-02-04");
      const res = await appWithEmptyRepo(req);

      assertEquals(res.status, 200);
      const html = await res.text();
      assertStringIncludes(html, "2026-02-04");
    },
  );

  await t.step(
    "GET /d/today returns 200 with today keyword shown",
    async () => {
      const req = new Request("http://localhost/d/today");
      const res = await appWithEmptyRepo(req);

      assertEquals(res.status, 200);
      const html = await res.text();
      // Should show "today" or resolved date
      assertStringIncludes(html, "today");
    },
  );

  await t.step("GET /d/not-a-date returns 400 for invalid date", async () => {
    const req = new Request("http://localhost/d/not-a-date");
    const res = await appWithEmptyRepo(req);

    assertEquals(res.status, 400);
    const html = await res.text();
    assertStringIncludes(html, "Invalid date");
  });

  await t.step(
    "GET /d/2099-01-01 shows 'No items' for empty date",
    async () => {
      const req = new Request("http://localhost/d/2099-01-01");
      const res = await appWithEmptyRepo(req);

      assertEquals(res.status, 200);
      const html = await res.text();
      assertStringIncludes(html, "No items");
    },
  );

  await t.step("GET /d/2026-02-04 shows items when they exist", async () => {
    const item = createTestItem({
      id: "019a85fc-67c4-7a54-be8e-305bae009f9e",
      title: "Test Task",
      placement: "2026-02-04",
      rank: "aaa",
    });
    const repoWithItems = new InMemoryItemRepository([item]);

    const appWithItems = new App<State>()
      .use((ctx) => {
        ctx.state.itemRepository = repoWithItems;
        ctx.state.timezone = timezone;
        return ctx.next();
      })
      .get("/d/:date", handler.GET)
      .handler();

    const req = new Request("http://localhost/d/2026-02-04");
    const res = await appWithItems(req);

    assertEquals(res.status, 200);
    const html = await res.text();
    assertStringIncludes(html, "Test Task");
  });

  await t.step("items are sorted by rank (ascending)", async () => {
    const item1 = createTestItem({
      id: "019a85fc-67c4-7a54-be8e-305bae009f9e",
      title: "First Task",
      placement: "2026-02-04",
      rank: "aaa",
    });
    const item2 = createTestItem({
      id: "019a85fc-67c4-7a54-be8e-305bae009f9f",
      title: "Second Task",
      placement: "2026-02-04",
      rank: "bbb",
    });
    const item3 = createTestItem({
      id: "019a85fc-67c4-7a54-be8e-305bae009fa0",
      title: "Third Task",
      placement: "2026-02-04",
      rank: "ccc",
    });
    // Add in wrong order to test sorting
    const repoWithItems = new InMemoryItemRepository([item3, item1, item2]);

    const appWithItems = new App<State>()
      .use((ctx) => {
        ctx.state.itemRepository = repoWithItems;
        ctx.state.timezone = timezone;
        return ctx.next();
      })
      .get("/d/:date", handler.GET)
      .handler();

    const req = new Request("http://localhost/d/2026-02-04");
    const res = await appWithItems(req);

    assertEquals(res.status, 200);
    const html = await res.text();
    // Check that items appear in rank order
    const firstIdx = html.indexOf("First Task");
    const secondIdx = html.indexOf("Second Task");
    const thirdIdx = html.indexOf("Third Task");
    assertEquals(firstIdx < secondIdx, true, "First should come before Second");
    assertEquals(secondIdx < thirdIdx, true, "Second should come before Third");
  });

  await t.step("items show icon and status", async () => {
    const item = createTestItem({
      id: "019a85fc-67c4-7a54-be8e-305bae009f9e",
      title: "Test Task",
      placement: "2026-02-04",
      rank: "aaa",
    });
    const repoWithItems = new InMemoryItemRepository([item]);

    const appWithItems = new App<State>()
      .use((ctx) => {
        ctx.state.itemRepository = repoWithItems;
        ctx.state.timezone = timezone;
        return ctx.next();
      })
      .get("/d/:date", handler.GET)
      .handler();

    const req = new Request("http://localhost/d/2026-02-04");
    const res = await appWithItems(req);

    assertEquals(res.status, 200);
    const html = await res.text();
    assertStringIncludes(html, "note"); // icon
    assertStringIncludes(html, "open"); // status
  });

  await t.step("page header shows human-readable date format", async () => {
    const req = new Request("http://localhost/d/2026-02-04");
    const res = await appWithEmptyRepo(req);

    assertEquals(res.status, 200);
    const html = await res.text();
    // Should show day of week and formatted date
    assertStringIncludes(html, "Wednesday");
    assertStringIncludes(html, "February");
    assertStringIncludes(html, "2026");
  });

  await t.step(
    "page header shows 'Today' when viewing today's date",
    async () => {
      const req = new Request("http://localhost/d/today");
      const res = await appWithEmptyRepo(req);

      assertEquals(res.status, 200);
      const html = await res.text();
      assertStringIncludes(html, "Today");
    },
  );
});
