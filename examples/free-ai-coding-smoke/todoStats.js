const PRIORITIES = ["low", "medium", "high"];

export function summarizeTodos(todos, { now = new Date() } = {}) {
  if (!Array.isArray(todos)) {
    throw new TypeError("todos must be an array");
  }

  const referenceDate = toValidDate(now, "now");
  const summary = {
    total: todos.length,
    open: 0,
    done: 0,
    overdue: 0,
    byPriority: {
      low: 0,
      medium: 0,
      high: 0
    }
  };

  for (const todo of todos) {
    validateTodo(todo);
    summary.byPriority[todo.priority] += 1;

    if (todo.done) {
      summary.done += 1;
      continue;
    }

    summary.open += 1;
    if (todo.dueDate && toValidDate(todo.dueDate, "dueDate") < referenceDate) {
      summary.overdue += 1;
    }
  }

  return summary;
}

function validateTodo(todo) {
  if (!todo || typeof todo !== "object" || Array.isArray(todo)) {
    throw new TypeError("todo must be an object");
  }
  if (typeof todo.title !== "string" || todo.title.trim() === "") {
    throw new TypeError("todo.title must be a non-empty string");
  }
  if (typeof todo.done !== "boolean") {
    throw new TypeError("todo.done must be a boolean");
  }
  if (!PRIORITIES.includes(todo.priority)) {
    throw new TypeError("todo.priority must be low, medium or high");
  }
}

function toValidDate(value, label) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`${label} must be a valid date`);
  }
  return date;
}
