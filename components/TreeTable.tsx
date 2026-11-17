"use client";

import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import s from './tree-table.module.css';

export type TreeTableSelection = { label: string; checked: boolean; mixed?: boolean; onChange: (checked: boolean) => void };
export type TreeTableRow<T> = { id: string; data: T; children?: TreeTableRow<T>[]; selection?: TreeTableSelection; expandLabel?: string };
export type TreeTableColumn<T> = { id: string; title: string; width: number; render: (data: T) => ReactNode; fixed?: boolean };

function Selection({ label, checked, mixed, onChange }: TreeTableSelection) {
  return <input className={s.checkbox} type="checkbox" aria-label={label} aria-checked={mixed ? 'mixed' : checked} checked={checked} ref={node => { if (node) node.indeterminate = !!mixed; }} onChange={event => onChange(event.target.checked)}/>;
}

/** Expandable product rows with optional dedicated columns for child records. */
export function TreeTable<T>({ label, columns, childColumns, rows, expanded, onExpandedChange, selection }: {
  label: string; columns: TreeTableColumn<T>[]; childColumns?: TreeTableColumn<T>[]; rows: TreeTableRow<T>[];
  expanded: ReadonlySet<string>; onExpandedChange: (id: string, expanded: boolean) => void; selection?: TreeTableSelection;
}) {
  const renderRows = (items: TreeTableRow<T>[], level = 1, rowColumns = columns): ReactNode => items.map((row, index) => {
    const hasChildren = !!row.children?.length, open = expanded.has(row.id);
    return <Fragment key={row.id}><tr className={level === 1 ? s.parentRow : s.childRow} role="row" aria-level={level} aria-posinset={index + 1} aria-setsize={items.length} aria-expanded={hasChildren ? open : undefined} aria-selected={row.selection?.checked}>
      {rowColumns.map((column, columnIndex) => <td key={column.id} role="gridcell" className={column.fixed ? s.fixed : undefined}>
        {columnIndex === 0 ? <div className={s.treeCell} style={{ '--tree-level': level - 1 } as CSSProperties}>
          {row.selection && <Selection {...row.selection}/>}
          <div className={s.branch} data-child={level > 1 || undefined} data-last={index === items.length - 1 || undefined}>
            {hasChildren ? <button className={s.expand} type="button" aria-expanded={open} aria-label={`${open ? '收起' : '展开'} ${row.expandLabel || row.id}`} onClick={() => onExpandedChange(row.id, !open)} onKeyDown={event => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); onExpandedChange(row.id, event.key === 'ArrowRight'); }
            }}>{open ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}</button> : <span className={s.dot} aria-hidden="true"/>}
          </div>
          <div className={s.nodeContent}>{column.render(row.data)}</div>
        </div> : column.render(row.data)}
      </td>)}
    </tr>{hasChildren && open && (childColumns ? <tr className={s.childGroup} role="row"><td colSpan={rowColumns.length} role="gridcell">
      <table className={`${s.table} ${s.childrenTable}`} role="treegrid" aria-label={row.expandLabel || `${label}明细`}>
        <colgroup>{childColumns.map(column => <col key={column.id} style={{ width: `${column.width / childColumns.reduce((total, item) => total + item.width, 0) * 100}%` }}/>)}</colgroup>
        <thead><tr role="row">{childColumns.map(column => <th key={column.id} scope="col" role="columnheader" className={column.fixed ? s.fixed : undefined}>{column.title}</th>)}</tr></thead>
        <tbody>{renderRows(row.children!, level + 1, childColumns)}</tbody>
      </table>
    </td></tr> : renderRows(row.children!, level + 1, rowColumns))}</Fragment>;
  });
  return <div className={s.scroll} tabIndex={0} role="region" aria-label={`${label}，可横向滚动`}><table className={s.table} role="treegrid" aria-label={label} style={{ minWidth: columns.reduce((total, column) => total + column.width, 0) }}>
    <colgroup>{columns.map(column => <col key={column.id} style={{ width: column.width }}/>)}</colgroup>
    <thead><tr role="row">{columns.map((column, index) => <th scope="col" role="columnheader" key={column.id} className={column.fixed ? s.fixed : undefined}>{index === 0 ? <div className={s.firstHeading}>{selection && <Selection {...selection}/>}<span>{column.title}</span></div> : column.title}</th>)}</tr></thead>
    <tbody>{renderRows(rows)}</tbody>
  </table></div>;
}
