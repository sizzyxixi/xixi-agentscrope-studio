"use client";

import { Tooltip } from "@heroui/react";
import { cloneElement, type HTMLAttributes, type ReactElement, type ReactNode, type Ref } from "react";
import { mergeProps } from "react-aria";

type TriggerProps = HTMLAttributes<HTMLElement> & { ref?: Ref<HTMLElement> };
const setRef = (ref: Ref<HTMLElement> | undefined, node: HTMLElement | null) => {
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
};

/** Keep the original element, layout and handlers while adding a HeroUI tooltip. */
export function Hint({ content, children }: { content?: ReactNode; children: ReactElement<TriggerProps> }) {
  if (content === undefined || content === null || content === "") return children;
  return <Tooltip delay={350} closeDelay={100}>
    <Tooltip.Trigger render={props => cloneElement(children, {
      ...mergeProps(props, children.props),
      className: children.props.className,
      role: children.props.role,
      ref: node => { setRef(props.ref, node); setRef(children.props.ref, node); },
    })} />
    <Tooltip.Content data-ui-popup="tooltip" className="workspaceTooltip" offset={8}>{content}</Tooltip.Content>
  </Tooltip>;
}
