/**
 * Undo/redo as an explicit command stack.
 *
 * Chosen over immer-patch approaches because it composes with multi-select and
 * grouped operations, and because every command is a named, inspectable object -
 * which gives us an audit trail almost for free later.
 * See docs/06-stack-review.md finding #6.
 */

export interface Command {
  /** Shown in the UI, e.g. "Move 3 elements". Keep it human. */
  readonly label: string;
  do(): void;
  undo(): void;
}

export class History {
  private past: Command[] = [];
  private future: Command[] = [];

  constructor(private readonly limit = 200) {}

  /** Execute a command and make it undoable. Clears the redo stack. */
  execute(command: Command): void {
    command.do();
    this.past.push(command);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  undo(): Command | null {
    const command = this.past.pop();
    if (!command) return null;
    command.undo();
    this.future.push(command);
    return command;
  }

  redo(): Command | null {
    const command = this.future.pop();
    if (!command) return null;
    command.do();
    this.past.push(command);
    return command;
  }

  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  get nextUndoLabel(): string | null { return this.past.at(-1)?.label ?? null; }
  get nextRedoLabel(): string | null { return this.future.at(-1)?.label ?? null; }

  clear(): void { this.past = []; this.future = []; }
}
