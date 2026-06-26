"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ColorField } from "@/components/ui/ColorField";
import {
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

interface FormField {
  name: string;
  type: "text" | "email" | "phone" | "select" | "checkbox";
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
}

const fieldTypeLabels: Record<string, string> = {
  text: "Text",
  email: "Email",
  phone: "Phone",
  select: "Dropdown",
  checkbox: "Checkbox",
};

const defaultFields: FormField[] = [
  { name: "email", type: "email", label: "Email", required: true, placeholder: "your@email.com" },
];

export default function NewFormPage() {
  const router = useRouter();
  const { data: stores } = (trpc as any).stores.list.useQuery();
  const store = stores?.[0];
  const storeId = store?.id as string | undefined;

  const [name, setName] = useState("");
  const [fields, setFields] = useState<FormField[]>(defaultFields);
  const submitAction = "subscribe";
  const [styling, setStyling] = useState({
    backgroundColor: "#ffffff",
    textColor: "#1a1a1a",
    buttonColor: "#000000",
    buttonTextColor: "#ffffff",
    buttonText: "Subscribe",
    borderRadius: "8px",
  });
  const [incentiveEnabled, setIncentiveEnabled] = useState(false);
  const [incentive, setIncentive] = useState({
    type: "discount" as "discount" | "freeShipping",
    discountType: "percentage" as "percentage" | "fixed_amount",
    discountValue: 10,
  });

  // Popup settings
  const [createPopup, setCreatePopup] = useState(true);
  const [popupName, setPopupName] = useState("");
  const [popupTrigger, setPopupTrigger] = useState<"exit_intent" | "scroll" | "timer" | "page_load">("exit_intent");
  const [popupDelay, setPopupDelay] = useState(5000);
  const [popupScroll, setPopupScroll] = useState(50);

  const createFormMut = (trpc as any).forms.createForm.useMutation({
    onSuccess: (form: any) => {
      if (createPopup && form?.id) {
        createPopupMut.mutate({
          storeId: storeId!,
          name: popupName || `${name} Popup`,
          formId: form.id,
          trigger: popupTrigger,
          triggerConfig: {
            ...(popupTrigger === "timer" ? { delayMs: popupDelay } : {}),
            ...(popupTrigger === "scroll" ? { scrollPercent: popupScroll } : {}),
          },
        });
      } else {
        router.push(`/forms/${form.id}`);
      }
    },
  });

  const createPopupMut = (trpc as any).forms.createPopup.useMutation({
    onSuccess: (_popup: any, variables: any) => {
      router.push(`/forms/${variables.formId}`);
    },
  });

  const addField = () => {
    setFields([
      ...fields,
      {
        name: `field_${fields.length}`,
        type: "text",
        label: "",
        required: false,
        placeholder: "",
      },
    ]);
  };

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const updateField = (index: number, updates: Partial<FormField>) => {
    setFields(fields.map((f, i) => (i === index ? { ...f, ...updates } : f)));
  };

  const handleSubmit = () => {
    if (!name.trim() || !storeId) return;
    createFormMut.mutate({
      storeId,
      name: name.trim(),
      fields,
      styling,
      submitAction,
      incentiveConfig: incentiveEnabled ? incentive : undefined,
    });
  };

  const isPending = createFormMut.isPending || createPopupMut.isPending;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="space-y-1">
        <Link
          href="/forms"
          className="inline-flex items-center gap-2 text-[11px] text-muted-foreground font-sans hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Forms
        </Link>
        <h1 className="text-[22px] tracking-[-0.5px] font-semibold text-foreground font-serif">
          New form
        </h1>
      </div>

      {/* Form Name */}
      <div className="space-y-2">
        <label className="text-[11px] font-sans font-bold text-muted-foreground uppercase tracking-[1px]">
          Form Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Newsletter signup"
          className="w-full px-4 py-2.5 bg-card border border-border rounded-lg text-[13px] font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 transition-colors"
        />
      </div>

      {/* Fields */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-sans font-bold text-muted-foreground uppercase tracking-[1px]">
            Fields
          </label>
          <button
            onClick={addField}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-sans font-bold text-foreground bg-muted border border-border rounded-lg hover:border-foreground/30 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Field
          </button>
        </div>

        <div className="space-y-2">
          {fields.map((field, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg"
            >
              <GripVertical className="w-4 h-4 text-muted-foreground/50 mt-2 flex-shrink-0" />
              <div className="flex-1 grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={field.label}
                  onChange={(e) => updateField(i, { label: e.target.value, name: e.target.value.toLowerCase().replace(/\s+/g, "_") })}
                  placeholder="Label"
                  className="px-3 py-2 bg-background border border-border rounded-md text-[12px] font-sans focus:outline-none focus:border-foreground/30"
                />
                <select
                  value={field.type}
                  onChange={(e) => updateField(i, { type: e.target.value as FormField["type"] })}
                  className="px-3 py-2 bg-background border border-border rounded-md text-[12px] font-sans focus:outline-none focus:border-foreground/30"
                >
                  {Object.entries(fieldTypeLabels).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={field.placeholder ?? ""}
                  onChange={(e) => updateField(i, { placeholder: e.target.value })}
                  placeholder="Placeholder text"
                  className="px-3 py-2 bg-background border border-border rounded-md text-[12px] font-sans focus:outline-none focus:border-foreground/30"
                />
                <label className="flex items-center gap-2 px-3 py-2 text-[12px] font-sans">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) => updateField(i, { required: e.target.checked })}
                    className="rounded"
                  />
                  Required
                </label>
              </div>
              <button
                onClick={() => removeField(i)}
                className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors mt-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Styling */}
      <div className="space-y-3">
        <label className="text-[11px] font-sans font-bold text-muted-foreground uppercase tracking-[1px]">
          Styling
        </label>
        <div className="grid grid-cols-2 gap-3 p-4 bg-card border border-border rounded-lg">
          {([
            ["buttonText", "Button Text"],
            ["buttonColor", "Button Color"],
            ["buttonTextColor", "Button Text Color"],
            ["backgroundColor", "Background"],
            ["textColor", "Text Color"],
            ["borderRadius", "Border Radius"],
          ] as const).map(([key, label]) => {
            const isColor = key.includes("Color") || key === "backgroundColor";
            return (
              <div key={key} className="space-y-1">
                <span className="text-[10px] font-sans text-muted-foreground">{label}</span>
                {isColor ? (
                  <ColorField
                    value={styling[key]}
                    onChange={(v) => setStyling({ ...styling, [key]: v })}
                  />
                ) : (
                  <input
                    type="text"
                    value={styling[key]}
                    onChange={(e) => setStyling({ ...styling, [key]: e.target.value })}
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-md text-[12px] font-sans text-foreground focus:outline-none focus:border-foreground/30"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Incentive */}
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-[11px] font-sans font-bold text-muted-foreground uppercase tracking-[1px] cursor-pointer">
          <input
            type="checkbox"
            checked={incentiveEnabled}
            onChange={(e) => setIncentiveEnabled(e.target.checked)}
            className="rounded"
          />
          Incentive (Discount on Signup)
        </label>
        {incentiveEnabled && (
          <div className="grid grid-cols-3 gap-3 p-4 bg-card border border-border rounded-lg">
            <div className="space-y-1">
              <span className="text-[10px] font-sans text-muted-foreground">Type</span>
              <select
                value={incentive.type}
                onChange={(e) => setIncentive({ ...incentive, type: e.target.value as "discount" | "freeShipping" })}
                className="w-full px-3 py-1.5 bg-background border border-border rounded-md text-[12px] font-sans"
              >
                <option value="discount">Discount</option>
                <option value="freeShipping">Free Shipping</option>
              </select>
            </div>
            {incentive.type === "discount" && (
              <>
                <div className="space-y-1">
                  <span className="text-[10px] font-sans text-muted-foreground">Discount Type</span>
                  <select
                    value={incentive.discountType}
                    onChange={(e) => setIncentive({ ...incentive, discountType: e.target.value as "percentage" | "fixed_amount" })}
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-md text-[12px] font-sans"
                  >
                    <option value="percentage">Percentage</option>
                    <option value="fixed_amount">Fixed Amount</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-sans text-muted-foreground">Value</span>
                  <input
                    type="number"
                    value={incentive.discountValue}
                    onChange={(e) => setIncentive({ ...incentive, discountValue: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-md text-[12px] font-sans"
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Popup Settings */}
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-[11px] font-sans font-bold text-muted-foreground uppercase tracking-[1px] cursor-pointer">
          <input
            type="checkbox"
            checked={createPopup}
            onChange={(e) => setCreatePopup(e.target.checked)}
            className="rounded"
          />
          Create Popup
        </label>
        {createPopup && (
          <div className="space-y-3 p-4 bg-card border border-border rounded-lg">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-[10px] font-sans text-muted-foreground">Popup Name</span>
                <input
                  type="text"
                  value={popupName}
                  onChange={(e) => setPopupName(e.target.value)}
                  placeholder={`${name || "Form"} Popup`}
                  className="w-full px-3 py-1.5 bg-background border border-border rounded-md text-[12px] font-sans focus:outline-none focus:border-foreground/30"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-sans text-muted-foreground">Trigger</span>
                <select
                  value={popupTrigger}
                  onChange={(e) => setPopupTrigger(e.target.value as typeof popupTrigger)}
                  className="w-full px-3 py-1.5 bg-background border border-border rounded-md text-[12px] font-sans"
                >
                  <option value="exit_intent">Exit Intent</option>
                  <option value="scroll">Scroll Depth</option>
                  <option value="timer">Timer</option>
                  <option value="page_load">Page Load</option>
                </select>
              </div>
            </div>
            {popupTrigger === "timer" && (
              <div className="space-y-1">
                <span className="text-[10px] font-sans text-muted-foreground">
                  Delay (seconds)
                </span>
                <input
                  type="number"
                  value={popupDelay / 1000}
                  onChange={(e) => setPopupDelay(Number(e.target.value) * 1000)}
                  className="w-full px-3 py-1.5 bg-background border border-border rounded-md text-[12px] font-sans"
                />
              </div>
            )}
            {popupTrigger === "scroll" && (
              <div className="space-y-1">
                <span className="text-[10px] font-sans text-muted-foreground">
                  Scroll Depth (%)
                </span>
                <input
                  type="number"
                  min={10}
                  max={100}
                  value={popupScroll}
                  onChange={(e) => setPopupScroll(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-background border border-border rounded-md text-[12px] font-sans"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4 border-t border-border">
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || !storeId || isPending}
          className="flex items-center gap-2 px-6 py-2.5 bg-foreground text-background rounded-lg text-[12px] font-sans font-bold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          {isPending ? "Creating..." : "Create form"}
        </button>
        <Link
          href="/forms"
          className="px-4 py-2.5 border border-border rounded-lg text-[12px] font-sans text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
