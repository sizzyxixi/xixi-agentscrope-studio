import { Children, Fragment, cloneElement, isValidElement, type Attributes, type ReactElement, type ReactNode } from "react";

/** React's automatic keys are local to each Fragment; retain the full ancestry. */
export function flattenMenuChildren<P extends { children?: ReactNode }>(children: ReactNode, parent = "menu"): ReactElement<P>[] {
  return Children.toArray(children).flatMap((child, index) => {
    if (!isValidElement<P>(child)) return [];
    const key = `${parent}/${index}:${child.key ?? "item"}`;
    return child.type === Fragment ? flattenMenuChildren<P>(child.props.children, key) : [cloneElement(child, { key } as Partial<P> & Attributes)];
  });
}

/** Stable across development refreshes that replace component function identities. */
export function menuNodeKind(node: ReactElement): string | undefined {
  return (node.type as { menuKind?: string }).menuKind;
}
