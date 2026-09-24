/**
 * A show-level line: belongs to the show, not to a spot on the plan.
 *
 * Instance stays a canvas placement (geometry required). Show items never
 * carry scale — their quantity is declared. Both aggregate into the same BOQ
 * by item_code.
 */

export interface ShowItem {
  readonly showItemId: string;
  readonly itemCode: string;
  /** Declared quantity. Never derived from geometry. */
  readonly qty: number;
  readonly params?: Readonly<Record<string, number>>;
}
