import test from "node:test";
import assert from "node:assert/strict";
import { summarizeTodos } from "./todoStats.js";

test("summarizeTodos counts open, done, overdue and priority buckets", () => {
  const todos = [
    { title: "Ship health check", done: true, priority: "high", dueDate: "2026-06-30" },
    { title: "Write docs", done: false, priority: "medium", dueDate: "2026-06-30" },
    { title: "Polish UI", done: false, priority: "low", dueDate: "2026-07-02" },
    { title: "Review tests", done: false, priority: "high" }
  ];

  assert.deepEqual(summarizeTodos(todos, { now: "2026-07-01T12:00:00Z" }), {
    total: 4,
    open: 3,
    done: 1,
    overdue: 1,
    byPriority: {
      low: 1,
      medium: 1,
      high: 2
    }
  });
});

test("summarizeTodos does not mutate input todos", () => {
  const todos = [
    { title: "Keep original", done: false, priority: "medium", dueDate: "2026-07-02" }
  ];
  const before = structuredClone(todos);

  summarizeTodos(todos, { now: "2026-07-01T12:00:00Z" });

  assert.deepEqual(todos, before);
});

test("summarizeTodos rejects invalid input clearly", () => {
  assert.throws(() => summarizeTodos(null), /todos must be an array/);
  assert.throws(() => summarizeTodos([{ title: "", done: false, priority: "low" }]), /todo.title/);
  assert.throws(() => summarizeTodos([{ title: "x", done: "no", priority: "low" }]), /todo.done/);
  assert.throws(() => summarizeTodos([{ title: "x", done: false, priority: "urgent" }]), /todo.priority/);
  assert.throws(
    () => summarizeTodos([{ title: "x", done: false, priority: "low", dueDate: "never" }]),
    /dueDate/
  );
});
