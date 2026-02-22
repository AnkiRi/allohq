"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Users, Eye } from "lucide-react";
import { trpc } from "@/lib/trpc";

const FIELD_OPTIONS = [
  { value: "rfmSegment", label: "RFM Segment", type: "select" as const },
  { value: "totalSpent", label: "Total Spent ($)", type: "number" as const },
  { value: "orderCount", label: "Order Count", type: "number" as const },
  { value: "avgOrderValue", label: "Avg Order Value ($)", type: "number" as const },
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
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 font-mono hover:text-gray-900 transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> BACK TO SEGMENTS
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 font-mono tracking-tight">
          NEW SEGMENT
        </h1>
        <p className="text-sm text-gray-400 font-mono mt-1">
          Define conditions to create a custom customer segment
        </p>
      </div>

      {/* Name + description */}
      <div className="border border-gray-200 rounded-xl p-6 bg-white space-y-4">
        <div>
          <label className="block text-xs text-gray-400 font-mono uppercase tracking-wider mb-2">
            SEGMENT NAME
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. High Value Repeat Buyers"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-mono text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 focus:shadow-[0_0_0_1px_rgba(0,0,0,1)] transition-all"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 font-mono uppercase tracking-wider mb-2">
            DESCRIPTION
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description..."
            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-mono text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 focus:shadow-[0_0_0_1px_rgba(0,0,0,1)] transition-all"
          />
        </div>
      </div>

      {/* Conditions */}
      <div className="border border-gray-200 rounded-xl p-6 bg-white">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-px h-6 bg-gray-900" />
            <h2 className="text-sm font-bold text-gray-900 font-mono">CONDITIONS</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-mono">Match</span>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {(["AND", "OR"] as const).map((op) => (
                <button
                  key={op}
                  onClick={() => setOperator(op)}
                  className={`px-3 py-1.5 text-xs font-mono transition-colors ${
                    operator === op
                      ? "bg-gray-900 text-white"
                      : "bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {op}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-400 font-mono">conditions</span>
          </div>
        </div>

        <div className="space-y-3">
          {conditions.map((cond, index) => {
            const fieldType = getFieldType(cond.field);
            const ops = (OP_OPTIONS[fieldType] ?? OP_OPTIONS.text)!;

            return (
              <div key={index} className="flex items-center gap-3">
                {index > 0 && (
                  <span className="text-xs text-gray-400 font-mono w-8 text-center flex-shrink-0">
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
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono text-gray-900 bg-white focus:outline-none focus:border-gray-900 transition-all"
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
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono text-gray-900 bg-white focus:outline-none focus:border-gray-900 transition-all"
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
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono text-gray-900 bg-white focus:outline-none focus:border-gray-900 transition-all"
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
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono text-gray-900 bg-white focus:outline-none focus:border-gray-900 transition-all"
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : fieldType === "number" ? (
                  <input
                    type="number"
                    value={Number(cond.value)}
                    onChange={(e) => updateCondition(index, { value: Number(e.target.value) })}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono text-gray-900 focus:outline-none focus:border-gray-900 transition-all"
                  />
                ) : (
                  <input
                    type="text"
                    value={String(cond.value)}
                    onChange={(e) => updateCondition(index, { value: e.target.value })}
                    placeholder="Enter value..."
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 transition-all"
                  />
                )}

                {/* Remove */}
                <button
                  onClick={() => removeCondition(index)}
                  disabled={conditions.length === 1}
                  className="p-2 text-gray-400 hover:text-gray-900 disabled:opacity-30 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>

        <button
          onClick={addCondition}
          className="mt-4 flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg text-xs font-mono text-gray-500 hover:border-gray-900 hover:text-gray-900 transition-all w-full justify-center"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Condition
        </button>
      </div>

      {/* Preview */}
      <div className="border border-gray-200 rounded-xl p-6 bg-white">
        <div className="flex items-center gap-3 mb-4">
          <Eye className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-bold text-gray-900 font-mono">PREVIEW</h2>
          {previewQuery.isLoading && (
            <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
          )}
        </div>

        {previewQuery.data ? (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Users className="w-5 h-5 text-gray-400" />
              <span className="text-2xl font-bold font-mono text-gray-900">
                {previewQuery.data.count}
              </span>
              <span className="text-sm text-gray-400 font-mono">matching customers</span>
            </div>
            {previewQuery.data.sample.length > 0 && (
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-4 py-2 text-xs font-mono text-gray-400 uppercase">Customer</th>
                      <th className="text-left px-4 py-2 text-xs font-mono text-gray-400 uppercase">Segment</th>
                      <th className="text-right px-4 py-2 text-xs font-mono text-gray-400 uppercase">Spent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {previewQuery.data.sample.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-2 text-sm font-mono text-gray-900">
                          {c.firstName} {c.lastName}
                          <span className="text-gray-400 ml-2">{c.email}</span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-mono rounded">
                            {c.segment ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-sm font-mono font-bold text-gray-900">
                          ${(c.totalSpent ?? 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 font-mono">
            Add conditions to see matching customers
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Link
          href="/segments"
          className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-mono text-gray-700 hover:border-gray-400 transition-all"
        >
          Cancel
        </Link>
        <button
          onClick={handleSave}
          disabled={!name.trim() || conditions.length === 0 || createSegment.isPending}
          className="px-6 py-2 bg-gray-900 text-white rounded-lg text-xs font-mono hover:bg-gray-800 disabled:opacity-50 transition-all"
        >
          {createSegment.isPending ? "Creating..." : "Create Segment"}
        </button>
      </div>
    </div>
  );
}
