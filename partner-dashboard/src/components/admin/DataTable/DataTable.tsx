import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import Pagination from '../../common/Pagination/Pagination';
import { palette, zIndex } from '../../../styles/adminTheme';

export interface ColumnDef<T> {
  key: string;
  header: string;
  sortable?: boolean;
  width?: string;
  minWidth?: string;
  render?: (row: T, index: number) => React.ReactNode;
}

export interface RowAction<T> {
  label: string;
  onClick: (row: T) => void;
  danger?: boolean;
  hidden?: (row: T) => boolean;
  disabled?: (row: T) => boolean;
  disabledTitle?: string | ((row: T) => string);
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  rowKey: (row: T) => string;
  rowActions?: RowAction<T>[];
  onRowClick?: (row: T) => void;
  rowStyle?: (row: T) => React.CSSProperties | undefined;
  loading?: boolean;
  emptyMessage?: React.ReactNode;
  // Pagination — omit both to hide pagination
  page?: number;
  pageSize?: number;
  totalItems?: number;
  onPageChange?: (page: number) => void;
  // Sorting — controlled externally when server-side
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string, dir: 'asc' | 'desc') => void;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  rowActions,
  onRowClick,
  rowStyle,
  loading,
  emptyMessage = 'Няма намерени записи',
  page,
  pageSize = 20,
  totalItems,
  onPageChange,
  sortKey,
  sortDir,
  onSort,
}: DataTableProps<T>) {
  const [openActionRow, setOpenActionRow] = useState<string | null>(null);

  // Close the open action menu when the user clicks anywhere outside it or presses Escape
  useEffect(() => {
    if (!openActionRow) return;
    const mouseHandler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-action-menu]')) {
        setOpenActionRow(null);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenActionRow(null);
    };
    document.addEventListener('mousedown', mouseHandler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', mouseHandler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [openActionRow]);

  const handleSort = (col: ColumnDef<T>) => {
    if (!col.sortable || !onSort) return;
    const nextDir = sortKey === col.key && sortDir === 'asc' ? 'desc' : 'asc';
    onSort(col.key, nextDir);
  };

  const totalPages = totalItems != null && pageSize ? Math.ceil(totalItems / pageSize) : 0;

  return (
    <Wrapper>
      <TableScroll>
        <Table>
          <thead>
            <tr>
              {columns.map((col) => (
                <Th
                  key={col.key}
                  style={{ width: col.width, minWidth: col.minWidth }}
                  $sortable={!!col.sortable}
                  onClick={() => handleSort(col)}
                >
                  <ThInner>
                    {col.header}
                    {col.sortable && (
                      <SortIcon $active={sortKey === col.key} $dir={sortDir}>
                        {sortKey === col.key && sortDir === 'desc' ? '↓' : '↑'}
                      </SortIcon>
                    )}
                  </ThInner>
                </Th>
              ))}
              {rowActions && rowActions.length > 0 && <Th style={{ width: '3rem' }} $sortable={false} />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + (rowActions ? 1 : 0)}>
                  <EmptyState>Зареждане…</EmptyState>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (rowActions ? 1 : 0)}>
                  <EmptyState>{emptyMessage}</EmptyState>
                </td>
              </tr>
            ) : (
              data.map((row, index) => {
                const key = rowKey(row);
                const visibleActions = rowActions?.filter((a) => !a.hidden?.(row)) ?? [];
                return (
                  <Tr
                    key={key}
                    $clickable={!!onRowClick}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    style={rowStyle?.(row)}
                  >
                    {columns.map((col) => (
                      <Td key={col.key} style={{ minWidth: col.minWidth }}>
                        {col.render ? col.render(row, index) : (row as any)[col.key]}
                      </Td>
                    ))}
                    {rowActions && rowActions.length > 0 && (
                      <Td>
                        {visibleActions.length > 0 && (
                          <PortalActionMenuToggle
                            key={key}
                            isOpen={openActionRow === key}
                            onToggle={() => setOpenActionRow(openActionRow === key ? null : key)}
                            visibleActions={visibleActions}
                            row={row}
                            onActionClick={() => setOpenActionRow(null)}
                          />
                        )}
                      </Td>
                    )}
                  </Tr>
                );
              })
            )}
          </tbody>
        </Table>
      </TableScroll>
      {totalPages > 1 && onPageChange && page != null && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems!}
          itemsPerPage={pageSize}
          onPageChange={onPageChange}
        />
      )}
    </Wrapper>
  );
}

const Wrapper = styled.div``;

const TableScroll = styled.div`
  overflow-x: auto;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  background: ${palette.surface};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
`;

const Th = styled.th<{ $sortable: boolean }>`
  padding: 0.75rem 1rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${palette.textMuted};
  background: ${palette.surfaceAlt};
  border-bottom: 1px solid ${palette.border};
  cursor: ${(p) => (p.$sortable ? 'pointer' : 'default')};
  user-select: none;

  &:hover {
    ${(p) => p.$sortable && `color: ${palette.text};`}
  }
`;

const ThInner = styled.span`
  display: flex;
  align-items: center;
  gap: 0.25rem;
`;

const SortIcon = styled.span<{ $active: boolean; $dir?: 'asc' | 'desc' }>`
  opacity: ${(p) => (p.$active ? 1 : 0.3)};
`;

const Tr = styled.tr<{ $clickable?: boolean }>`
  border-bottom: 1px solid ${palette.border};
  transition: background 100ms;
  cursor: ${(p) => (p.$clickable ? 'pointer' : 'default')};

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: ${palette.bg};
  }
`;

const Td = styled.td`
  padding: 0.75rem 1rem;
  color: ${palette.text};
  vertical-align: middle;
`;

const EmptyState = styled.div`
  padding: 3rem 1rem;
  text-align: center;
  color: ${palette.textSubtle};
  font-size: 0.875rem;
`;

const ActionMenu = styled.div`
  position: relative;
  display: inline-block;
  z-index: ${zIndex.dropdown};
`;

const ActionToggle = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${palette.textMuted};
  font-size: 1.25rem;
  line-height: 1;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;

  &:hover {
    background: ${palette.surfaceAlt};
    color: ${palette.text};
  }
`;

const PortalActionDropdown = styled.div`
  position: fixed;
  z-index: ${zIndex.dropdown};
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  min-width: 10rem;
  overflow: hidden;
`;

const ActionItem = styled.button<{ $danger: boolean }>`
  display: block;
  width: 100%;
  padding: 0.625rem 1rem;
  text-align: left;
  background: none;
  border: none;
  font-size: 0.875rem;
  cursor: pointer;
  color: ${(p) => (p.$danger ? palette.danger : palette.text)};
  transition: background 100ms;

  &:hover {
    background: ${(p) => (p.$danger ? palette.dangerSoft : palette.surfaceAlt)};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &:disabled:hover {
    background: none;
  }
`;

// Portal-based action menu that escapes overflow containers
function PortalActionMenuToggle<T>({
  isOpen,
  onToggle,
  visibleActions,
  row,
  onActionClick,
}: {
  isOpen: boolean;
  onToggle: () => void;
  visibleActions: RowAction<T>[];
  row: T;
  onActionClick: () => void;
}) {
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ top: 0, right: 0 });

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Calculate position before calling onToggle so the first render of the
    // dropdown already has the correct coords (React 18 batches both state
    // updates into a single flush, eliminating the flash-at-top-of-page).
    // position: fixed is viewport-relative — no scrollY offset needed.
    if (!isOpen && toggleRef.current) {
      const rect = toggleRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom, right: window.innerWidth - rect.right });
    }
    onToggle();
  };

  return (
    <>
      <ActionMenu data-action-menu="true">
        <ActionToggle ref={toggleRef} onClick={handleToggle}>
          ···
        </ActionToggle>
      </ActionMenu>
      {isOpen &&
        createPortal(
          <PortalActionDropdown style={{ top: `${position.top}px`, right: `${position.right}px` }}>
            {visibleActions.map((action) => {
              const isDisabled = !!action.disabled?.(row);
              return (
                <ActionItem
                  key={action.label}
                  $danger={!!action.danger}
                  disabled={isDisabled}
                  title={
                    isDisabled
                      ? typeof action.disabledTitle === 'function'
                        ? action.disabledTitle(row)
                        : action.disabledTitle
                      : undefined
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isDisabled) return;
                    onActionClick();
                    action.onClick(row);
                  }}
                >
                  {action.label}
                </ActionItem>
              );
            })}
          </PortalActionDropdown>,
          document.body,
        )}
    </>
  );
}
