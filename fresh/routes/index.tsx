import { define } from "../utils.ts";

export default define.page(function Home() {
  return (
    <main>
      <h1>mm Local Browser</h1>
      <p>Browse your mm workspace locally.</p>
      <nav>
        <h2>Navigation</h2>
        <ul>
          <li>
            <a href="/d/today">Today's items</a> - View items for today
          </li>
          <li>
            <code>/d/:date</code> - Browse items by date (e.g., /d/2026-02-04)
          </li>
          <li>
            <code>/i/:id</code> - View item details by ID
          </li>
          <li>
            <code>/a/:alias</code> - Resolve alias to item
          </li>
          <li>
            <code>/tree/:rootId</code> - Tree view starting from an item
          </li>
          <li>
            <code>/search?q=...</code> - Search items
          </li>
        </ul>
      </nav>
    </main>
  );
});
