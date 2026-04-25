/**
 * Ephemeral per-turn plan store. The agent calls the `planTasks` tool at
 * the top of a large request; the client records the plan here and the
 * chat renders it as a checklist. As `createScreen` / `updateScreen` tool
 * calls succeed, the corresponding task auto-advances.
 *
 * Plans are keyed by `planId` (the toolCallId of the planTasks invocation).
 * Only the MOST RECENT plan is "current" — rendered in the chat thread and
 * used for auto-progress. Older plans stay in memory for the session so
 * they can be referenced if the agent keeps working on an earlier one.
 */

export type PlanTaskStatus = "pending" | "in_progress" | "complete" | "failed";

export type PlanTask = {
  id: string; // stable across status changes
  description: string; // what this task will produce
  /**
   * Tasks that can run in parallel with each other. When true, the agent is
   * free to kick off this task concurrently with other parallelizable tasks.
   * Used to hint the UI that we expect multiple streams at once.
   */
  parallelizable: boolean;
  status: PlanTaskStatus;
  /** Populated once a createScreen/updateScreen tool call is linked. */
  screenId?: string;
  /** Optional free-form hint — e.g. "iPhone 17". */
  hint?: string;
};

export type Plan = {
  id: string; // the planTasks toolCallId
  title: string;
  tasks: PlanTask[];
  startedAt: number;
};

type Listener = (current: Plan | null, all: Map<string, Plan>) => void;

class PlanStore {
  private plans = new Map<string, Plan>();
  private currentId: string | null = null;
  private listeners = new Set<Listener>();

  getCurrent(): Plan | null {
    return this.currentId ? (this.plans.get(this.currentId) ?? null) : null;
  }

  getAll(): Map<string, Plan> {
    return new Map(this.plans);
  }

  setPlan(id: string, title: string, tasks: Omit<PlanTask, "status">[]) {
    if (!id || !Array.isArray(tasks)) return;
    const plan: Plan = {
      id,
      title: title || "Plan",
      tasks: tasks.map((t, i) => ({
        id: t.id || `t_${i}`,
        description: t.description,
        parallelizable: !!t.parallelizable,
        status: "pending",
        screenId: t.screenId,
        hint: t.hint,
      })),
      startedAt: Date.now(),
    };
    this.plans.set(id, plan);
    this.currentId = id;
    this.notify();
  }

  updateTask(
    planId: string,
    taskId: string,
    patch: Partial<Pick<PlanTask, "status" | "screenId">>,
  ) {
    const plan = this.plans.get(planId);
    if (!plan) return;
    const next: Plan = {
      ...plan,
      tasks: plan.tasks.map((t) =>
        t.id === taskId ? { ...t, ...patch } : t,
      ),
    };
    this.plans.set(planId, next);
    this.notify();
  }

  /**
   * Auto-progress helper. When a screen-op tool call succeeds, try to match
   * it to a pending task in the current plan. Match precedence:
   *   1. Exact task id via explicit `taskId` passed by the agent.
   *   2. First task whose description contains the screen's name.
   *   3. First pending task.
   */
  advanceFromScreenOp(opts: {
    taskId?: string;
    screenId: string;
    screenName?: string;
    status: "in_progress" | "complete" | "failed";
  }) {
    if (!this.currentId) return;
    const plan = this.plans.get(this.currentId);
    if (!plan) return;

    const lc = opts.screenName?.toLowerCase() ?? "";
    const match =
      (opts.taskId && plan.tasks.find((t) => t.id === opts.taskId)) ||
      (lc &&
        plan.tasks.find(
          (t) =>
            t.status !== "complete" && t.description.toLowerCase().includes(lc),
        )) ||
      plan.tasks.find((t) => t.status === "pending") ||
      null;
    if (!match) return;
    this.updateTask(plan.id, match.id, {
      status: opts.status,
      screenId: opts.screenId,
    });
  }

  clearAll() {
    this.plans.clear();
    this.currentId = null;
    this.notify();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  private notify() {
    for (const l of this.listeners) l(this.getCurrent(), this.getAll());
  }
}

export const planStore = new PlanStore();

if (typeof window !== "undefined") {
  (window as unknown as { __planStore: PlanStore }).__planStore = planStore;
}
