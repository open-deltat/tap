"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, Plus, Trash2, Clock, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Resource } from "@/lib/schemas";
import { cn } from "@/lib/utils";

interface ResourceTreeProps {
  resources: Resource[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateChildren: (parentId: string | null) => void;
  onDelete: (id: string) => void;
  onAddRule: (resourceId: string) => void;
  onSettings: (resourceId: string) => void;
}

export function ResourceTree({
  resources,
  selectedId,
  onSelect,
  onCreateChildren,
  onDelete,
  onAddRule,
  onSettings,
}: ResourceTreeProps) {
  const roots = resources.filter((r) => r.parentId === null);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Resources</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onCreateChildren(null)}
          title="Add root resource"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          {roots.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              No resources yet
            </p>
          ) : (
            roots.map((r) => (
              <ResourceNode
                key={r.id}
                resource={r}
                resources={resources}
                selectedId={selectedId}
                onSelect={onSelect}
                onCreateChildren={onCreateChildren}
                onDelete={onDelete}
                onAddRule={onAddRule}
                onSettings={onSettings}
                depth={0}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function countDescendants(resources: Resource[], id: string): number {
  const children = resources.filter((r) => r.parentId === id);
  if (children.length === 0) return 1; // leaf = 1 slot
  return children.reduce((sum, c) => sum + countDescendants(resources, c.id), 0);
}

interface ResourceNodeProps {
  resource: Resource;
  resources: Resource[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateChildren: (parentId: string) => void;
  onDelete: (id: string) => void;
  onAddRule: (resourceId: string) => void;
  onSettings: (resourceId: string) => void;
  depth: number;
}

function ResourceNode({
  resource,
  resources,
  selectedId,
  onSelect,
  onCreateChildren,
  onDelete,
  onAddRule,
  onSettings,
  depth,
}: ResourceNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const children = resources.filter((r) => r.parentId === resource.id);
  const hasChildren = children.length > 0;
  const isSelected = selectedId === resource.id;
  const slots = hasChildren ? countDescendants(resources, resource.id) : 0;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent",
          isSelected && "bg-accent font-medium"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(resource.id)}
      >
        {hasChildren ? (
          <button
            className="shrink-0 p-0.5 hover:bg-muted rounded"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="w-[18px] shrink-0" />
        )}

        <span className="flex-1 truncate">{resource.name}</span>

        {slots > 1 && (
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {slots}
          </Badge>
        )}

        <div className="hidden gap-0.5 group-hover:flex">
          <button
            className="rounded p-0.5 hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              onSettings(resource.id);
            }}
            title="Settings"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button
            className="rounded p-0.5 hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              onAddRule(resource.id);
            }}
            title="Add rule"
          >
            <Clock className="h-3.5 w-3.5" />
          </button>
          <button
            className="rounded p-0.5 hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              onCreateChildren(resource.id);
            }}
            title="Add children"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            className="rounded p-0.5 hover:bg-destructive hover:text-destructive-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(resource.id);
            }}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {expanded &&
        hasChildren &&
        children.map((child) => (
          <ResourceNode
            key={child.id}
            resource={child}
            resources={resources}
            selectedId={selectedId}
            onSelect={onSelect}
            onCreateChildren={onCreateChildren}
            onDelete={onDelete}
            onAddRule={onAddRule}
            onSettings={onSettings}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}
