"use client";

import { Tooltip } from "@heroui/react";
import { cloneElement, forwardRef, type HTMLAttributes, type ReactElement, type ReactNode, type Ref } from "react";
import { mergeProps } from "react-aria";

type TriggerProps = HTMLAttributes<HTMLElement> & { ref?: Ref<HTMLElement> };
const setRef = (ref: Ref<HTMLElement> | undefined, node: HTMLElement | null) => {
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
};

/** Keep the original element, layout and handlers while adding a HeroUI tooltip. */
export const Hint = forwardRef<HTMLElement, Omit<TriggerProps, "content" | "children" | "ref"> & { content?: ReactNode; children: ReactElement<TriggerProps> }>(function Hint({ content, children, ...triggerProps }, forwardedRef) {
  const renderTrigger = (tooltipProps: TriggerProps = {}) => cloneElement(children, {
    ...mergeProps(tooltipProps, triggerProps, children.props),
    role: children.props.role ?? triggerProps.role,
    ref: (node: HTMLElement | null) => { setRef(tooltipProps.ref, node); setRef(forwardedRef, node); setRef(children.props.ref, node); },
  });
  if (content === undefined || content === null || content === "") return renderTrigger();
  return <Tooltip delay={350} closeDelay={100}>
    <Tooltip.Trigger render={renderTrigger} />
    <Tooltip.Content data-ui-popup="tooltip" className="workspaceTooltip" offset={8}>{content}</Tooltip.Content>
  </Tooltip>;
});
