"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Users, Eye } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatINR } from "@/components/console";

const FIELD_OPTIONS = [
  { value: "rfmSegment", label: "RFM Segment", type: "select" as const },
  { value: "totalSpent", label: "Total Spent (₹)", type: "number" as const },
  { value: "orderCount", label: "Order Count", type: "number" as const },
  { value: "avgOrderValue", label: "Avg Order Value (₹)", type: "number" as const },
  { value: "daysSinceLastOrder", label: "Days Since Last Order", type: "number" as const },
  { value: "acceptsMarketing", label: "Accepts Marketing", type: "boolean" as const },
  { value: "purchasedProduct", label: "Purchased Product", type: "text" as const },
];

const OP_OPTIONS: Record<string, { value: string; label: string }[]> = {
  number: [
    { value: "greaterThan", label: "greater than" },
    { value: "lessThan", label: "less than" },
    { value: "greaterThanOrEqual", label: "at least" },
    { value: "lessThanOrEqual", label: "at most" },
    { value: "equals", label: "equals" },
  ],
  select: [
    { value: "equals", label: "is" },
    { value: "notEquals", label: "is not" },
  ],
  boolean: [
    { value: "equals", label: "is" },
  ],
  text: [
    { value: "contains", label: "contains" },
    { value: "equals", label: "equals" },
  ],
};

const RFM_SEGMENTS = [
  "Champions", "Loyal Customers", "Potential Loyalists", "New Customers",
  "At Risk", "Can't Lose Them", "Hibernating", "Lost",
];

interface Condition {
  field: string;
  op: string;
  value: string | number | boolean;
}

export default function NewSegmentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [operator, setOperator] = useState<"AND" | "OR">("AND");
  const [conditions, setConditions] = useState<Condition[]>([
    { field: "rfmSegment", op: "equals", value: "Champions" },
  ]);

  const { data: stores } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id;

  const utils = trpc.useUtils();
  const createSegment = trpc.segments.create.useMutation({
    onSuccess: () => {
      utils.segments.list.invalidate();
      router.push("/segments");
    },
  });

  const previewQuery = trpc.segments.preview.useQuery(
    {
      storeId: storeId!,
      conditions: {
        operator,
        conditions: conditions.map((c) => ({
          field: c.field as any,
          op: c.op as any,
          value: c.value,
        })),
      },
    },
    {
      enabled: !!storeId && conditions.length > 0 && conditions.every((c) => c.value !== ""),
    }
  );

  function addCondition() {
    setConditions([...conditions, { field: "totalSpent", op: "greaterThan", value: 0 }]);
  }

  function removeCondition(index: number) {
    setConditions(conditions.filter((_, i) => i !== index));
  }

  function updateCondition(index: number, updates: Partial<Condition>) {
    setConditions(conditions.map((c, i) => (i === index ? { ...c, ...updates } : c)));
  }

  function getFieldType(field: string) {
    return FIELD_OPTIONS.find((f) => f.value === field)?.type ?? "text";
  }

  async function handleSave() {
    if (!storeId || !name.trim() || conditions.length === 0) return;
    await createSegment.mutateAsync({
      storeId,
      name: name.trim(),
      description: description.trim() || undefined,
      conditions: {
        operator,
        conditions: conditions.map((c) => ({
          field: c.field as any,
          op: c.op as any,
          value: c.value,
        })),
      },
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/segments"
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground font-sans hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to segments
        </Link>
        <h1 className="text-[22px] tracking-[-0.5px] font-semibold text-foreground font-serif">
          New segment
        </h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Set a few conditions and allo will gather everyone who fits.
        </p>
      </div>

      {/* Name + description */}
      <div className="border border-border rounded-xl p-6 bg-card space-y-4">
        <div>
          <label className="block text-[10px] text-muted-foreground font-sans uppercase font-bold tracking-[1px] mb-2">
            SEGMENT NAME
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. High Value Repeat Buyers"
            className="w-full px-4 py-2.5 border border-border rounded-lg text-[13px] font-sans text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground focus:shadow-[0_0_0_1px_hsl(var(--foreground))] transition-all"
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground font-sans uppercase font-bold tracking-[1px] mb-2">
            DESCRIPTION
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description..."
            className="w-full px-4 py-2.5 border border-border rounded-lg text-[13px] font-sans text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground focus:shadow-[0_0_0_1px_hsl(var(--foreground))] transition-all"
          />
        </div>
      </div>

      {/* Conditions */}
      <div className="border border-border rounded-xl p-6 bg-card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-px h-6 bg-secondary" />
            <h2 className="text-[13px] font-bold text-foreground font-serif">Conditions</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground font-sans">Match</span>
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(["AND", "OR"] as const).map((op) => (
                <button
                  key={op}
                  onClick={() => setOperator(op)}
                  className={`px-3 py-1.5 text-[11px] font-sans transition-colors ${
                    operator === op
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {op}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-muted-foreground font-sans">conditions</span>
          </div>
        </div>

        <div className="space-y-3">
          {conditions.map((cond, index) => {
            const fieldType = getFieldType(cond.field);
            const ops = (OP_OPTIONS[fieldType] ?? OP_OPTIONS.text)!;

            return (
              <div key={index} className="flex items-center gap-3">
                {index > 0 && (
                  <span className="text-[11px] text-muted-foreground font-sans w-8 text-center flex-shrink-0">
                    {operator}
                  </span>
                )}
                {index === 0 && <span className="w-8 flex-shrink-0" />}

                {/* Field selector */}
                <select
                  value={cond.field}
                  onChange={(e) => {
                    const newField = e.target.value;
                    const newType = getFieldType(newField);
                    const newOps = OP_OPTIONS[newType] ?? OP_OPTIONS.text!;
                    updateCondition(index, {
                      field: newField,
                      op: newOps![0]!.value,
                      value: newType === "boolean" ? true : newType === "number" ? 0 : "",
                    });
                  }}
                  className="px-3 py-2 border border-border rounded-lg text-[13px] font-sans text-foreground bg-card focus:outline-none focus:border-foreground transition-all"
                >
                  {FIELD_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>

                {/* Operator */}
                <select
                  value={cond.op}
                  onChange={(e) => updateCondition(index, { op: e.target.value })}
                  className="px-3 py-2 border border-border rounded-lg text-[13px] font-sans text-foreground bg-card focus:outline-none focus:border-foreground transition-all"
                >
                  {ops.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                {/* Value input */}
                {cond.field === "rfmSegment" ? (
                  <select
                    value={String(cond.value)}
                    onChange={(e) => updateCondition(index, { value: e.target.value })}
                    className="flex-1 px-3 py-2 border border-border rounded-lg text-[13px] font-sans text-foreground bg-card focus:outline-none focus:border-foreground transition-all"
                  >
                    {RFM_SEGMENTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : cond.field === "acceptsMarketing" ? (
                  <select
                    value={String(cond.value)}
                    onChange={(e) => updateCondition(index, { value: e.target.value === "true" })}
                    className="flex-1 px-3 py-2 border border-border rounded-lg text-[13px] font-sans text-foreground bg-card focus:outline-none focus:border-foreground transition-all"
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : fieldType === "number" ? (
                  <input
                    type="number"
                    value={Number(cond.value)}
                    onChange={(e) => updateCondition(index, { value: Number(e.target.value) })}
                    className="flex-1 px-3 py-2 border border-border rounded-lg text-[13px] font-mono text-foreground focus:outline-none focus:border-foreground transition-all"
                  />
                ) : (
                  <input
                    type="text"
                    value={String(cond.value)}
                    onChange={(e) => updateCondition(index, { value: e.target.value })}
                    placeholder="Enter value..."
                    className="flex-1 px-3 py-2 border border-border rounded-lg text-[13px] font-sans text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-all"
                  />
                )}

                {/* Remove */}
                <button
                  onClick={() => removeCondition(index)}
                  disabled={conditions.length === 1}
                  className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>

        <button
          onClick={addCondition}
          className="mt-4 flex items-center gap-2 px-4 py-2 border border-dashed border-muted-foreground/50 rounded-lg text-[11px] font-sans text-muted-foreground hover:border-foreground hover:text-foreground transition-all w-full justify-center"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Condition
        </button>
      </div>

      {/* Preview */}
      <div className="border border-border rounded-xl p-6 bg-card">
        <div className="flex items-center gap-3 mb-4">
          <Eye className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-[13px] font-bold text-foreground font-serif">Preview</h2>
          {previewQuery.isLoading && (
            <div className="w-3 h-3 border-2 border-muted-foreground/50 border-t-foreground rounded-full animate-spin" />
          )}
        </div>

        {previewQuery.data ? (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Users className="w-5 h-5 text-muted-foreground" />
              <span className="text-[28px] tabular-nums font-bold font-mono text-foreground">
                {previewQuery.data.count.toLocaleString("en-IN")}
              </span>
              <span className="text-[13px] text-muted-foreground">customers like this so far</span>
            </div>
            {previewQuery.data.sample.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2 text-[10px] tracking-[0.5px] font-sans text-muted-foreground uppercase">Customer</th>
                      <th className="text-left px-4 py-2 text-[10px] tracking-[0.5px] font-sans text-muted-foreground uppercase">Segment</th>
                      <th className="text-right px-4 py-2 text-[10px] tracking-[0.5px] font-sans text-muted-foreground uppercase">Spent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previewQuery.data.sample.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-2 text-[13px] font-sans text-foreground">
                          {c.firstName} {c.lastName}
                          <span className="text-muted-foreground ml-2">{c.email}</span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="px-2 py-0.5 bg-muted text-foreground text-[11px] font-sans rounded">
                            {c.segment ?? "\u2014"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-[13px] font-mono font-bold text-foreground">
                          {formatINR(c.totalSpent ?? 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Add a condition or two and you&apos;ll see who fits.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Link
          href="/segments"
          className="px-4 py-2 border border-border rounded-lg text-[11px] font-sans text-foreground hover:border-primary/50 transition-all"
        >
          Cancel
        </Link>
        <button
          onClick={handleSave}
          disabled={!name.trim() || conditions.length === 0 || createSegment.isPending}
          className="px-6 py-2 bg-secondary text-secondary-foreground rounded-lg text-[11px] font-sans hover:bg-secondary/90 disabled:opacity-50 transition-all"
        >
          {createSegment.isPending ? "Gathering them…" : "Gather this segment"}
        </button>
      </div>
    </div>
  );
}
