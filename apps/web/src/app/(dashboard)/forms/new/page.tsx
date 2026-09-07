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
  type: "text" | "email" | "phone" | "checkbox";
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
  step?: number;
  traitKey?: string;
}

const fieldTypeLabels: Record<string, string> = {
  text: "Text",
  email: "Email",
  checkbox: "Checkbox",
  phone: "Phone",
};

const defaultFields: FormField[] = [
  { name: "email", type: "email", label: "Email", required: true, placeholder: "your@email.com" },
  {
    name: "consent_email",
    type: "checkbox",
    label: "Yes, email me offers and updates. I can unsubscribe at any time.",
    required: true,
  },
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
    consentVersion: "global-v1",
    market: "global" as "global" | "eu_uk" | "us" | "canada" | "australia",
    smsDisclosure: "By opting into texts, you agree to receive recurring automated marketing messages. Consent is not a condition of purchase. Message and data rates may apply. Reply STOP to opt out.",
  });
  const [incentiveEnabled, setIncentiveEnabled] = useState(false);
  const [incentive, setIncentive] = useState({
    type: "discount" as const,
    mode: "fixed" as "fixed" | "spin",
    allowKnownCustomers: false,
    discountType: "percentage" as "percentage" | "fixed_amount",
    discountValue: 10,
    spinOutcomes: [{label:"10% off",weight:60,discountType:"percentage" as const,discountValue:10},{label:"15% off",weight:30,discountType:"percentage" as const,discountValue:15},{label:"No prize this time",weight:10,discountValue:0}],
  });
  const [experimentEnabled,setExperimentEnabled]=useState(false);

  // Popup settings
  const [createPopup, setCreatePopup] = useState(true);
  const [popupName, setPopupName] = useState("");
  const [popupTrigger, setPopupTrigger] = useState<"exit_intent" | "scroll" | "timer" | "page_load">("exit_intent");
  const [popupDelay, setPopupDelay] = useState(5000);
  const [popupScroll, setPopupScroll] = useState(50);
  const [popupPosition, setPopupPosition] = useState<"center" | "bottom-left" | "bottom-right" | "top-bar">("center");

  const createFormMut = (trpc as any).forms.createForm.useMutation({
    onSuccess: (form: any) => {
      if (createPopup && form?.id) {
        createPopupMut.mutate({
          storeId: storeId!,
          name: popupName || `${name} Popup`,
          formId: form.id,
          trigger: popupTrigger,
          triggerConfig: {
            frequencyDays: 7,
            ...(popupTrigger === "timer" ? { delayMs: popupDelay } : {}),
            ...(popupTrigger === "scroll" ? { scrollPercent: popupScroll } : {}),
          },
          styling: {
            position: popupPosition,
            overlayColor: popupPosition === "center" ? "rgba(0,0,0,0.52)" : "rgba(0,0,0,0)",
            animation: popupPosition === "top-bar" ? "slide-down" : popupPosition === "center" ? "scale" : "slide-up",
            width: popupPosition === "top-bar" ? "100%" : "420px",
          },
        });
      } else {
        router.push(`/forms/${form.id}`);
      }
    },
  });

  const createPopupMut = (trpc as any).forms.createPopup.useMutation({
    onSuccess: (popup: any, variables: any) => {
      if(experimentEnabled) createExperimentMut.mutate({storeId:storeId!,formId:variables.formId,popupId:popup.id,name:`${popupName||name} popup test`,controlRatio:0.1,splitRatio:0.5,variantA:{},variantB:{triggerConfig:{delayMs:Math.max(1000,popupDelay+3000)}}});
      else router.push(`/forms/${variables.formId}`);
    },
  });
  const createExperimentMut=(trpc as any).forms.createExperiment.useMutation({onSuccess:(experiment:any)=>{activateExperimentMut.mutate({experimentId:experiment.id,status:"active"})}});
  const activateExperimentMut=(trpc as any).forms.setExperimentStatus.useMutation({onSuccess:()=>router.push(`/forms/${(createPopupMut.variables as any)?.formId}`)});

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

  const toggleSmsCapture = () => {
    if (fields.some((field) => field.name === "phone")) {
      setFields(fields.filter((field) => field.name !== "phone" && field.name !== "consent_sms"));
      return;
    }
    setFields([
      ...fields,
      { name: "phone", type: "phone", label: "Mobile number", required: false, placeholder: "+14155552671", step: 2 },
      { name: "consent_sms", type: "checkbox", label: styling.smsDisclosure, required: false, step: 2 },
    ]);
  };
  const applyMarket = (market: typeof styling.market) => {
    const emailLabel = market === "us" ? "Yes, send me marketing emails. I can unsubscribe at any time." : "I agree to receive marketing emails. I can withdraw consent at any time.";
    const smsDisclosure = market === "canada" ? "I expressly agree to receive recurring marketing text messages. Consent is optional. Message and data rates may apply. Reply STOP to opt out." : styling.smsDisclosure;
    setStyling({ ...styling, market, consentVersion: `${market}-v1`, smsDisclosure });
    setFields(fields.map(field => field.name === "consent_email" ? { ...field, label: emailLabel } : field.name === "consent_sms" ? { ...field, label: smsDisclosure } : field));
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

  const isPending = createFormMut.isPending || createPopupMut.isPending || createExperimentMut.isPending || activateExperimentMut.isPending;

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
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[11px] font-sans font-bold text-muted-foreground uppercase tracking-[1px]">
            Fields
          </label>
          <button className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-sans font-bold text-foreground bg-muted border border-border rounded-lg hover:border-foreground/30 transition-colors"
            onClick={addField}
          >
            <Plus className="w-3 h-3" />
            Add Field
          </button>
          <button
            onClick={toggleSmsCapture}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-sans font-bold text-foreground bg-muted border border-border rounded-lg hover:border-foreground/30 transition-colors"
          >
            {fields.some((field) => field.name === "phone") ? "Remove phone capture" : <><Plus className="w-3 h-3" /> Phone + SMS consent</>}
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
                  onChange={(e) => updateField(i, { label: e.target.value })}
                  placeholder="Label"
                  className="px-3 py-2 bg-background border border-border rounded-md text-[12px] font-sans focus:outline-none focus:border-foreground/30"
                />
                <select
                  value={field.type}
                  disabled={["email", "consent_email", "phone", "consent_sms"].includes(field.name)}
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
                <label className="space-y-1 text-[10px] text-muted-foreground">Step
                  <input type="number" min={1} max={5} value={field.step ?? 1} onChange={(e) => updateField(i, { step: Math.max(1, Math.min(5, Number(e.target.value))) })} className="block w-full px-3 py-2 bg-background border border-border rounded-md text-[12px] text-foreground" />
                </label>
                {!field.name.startsWith("consent_") && !["email", "phone"].includes(field.name) && <label className="space-y-1 text-[10px] text-muted-foreground">Customer trait
                  <input value={field.traitKey ?? ""} onChange={(e) => updateField(i, { traitKey: e.target.value })} placeholder="preferences.skin_type" className="block w-full px-3 py-2 bg-background border border-border rounded-md text-[12px] text-foreground" />
                </label>}
              </div>
              <button
                onClick={() => removeField(i)}
                disabled={["email", "consent_email", "phone", "consent_sms"].includes(field.name)}
                className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors mt-1"
                title={field.name === "email" || field.name === "consent_email" ? "Required for consent-safe email signup" : "Remove field"}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-[11px] font-sans font-bold text-muted-foreground uppercase tracking-[1px]">Consent policy</label>
        <div className="space-y-3 p-4 bg-card border border-border rounded-lg">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-[10px] text-muted-foreground">Primary market
              <select value={styling.market} onChange={(e) => applyMarket(e.target.value as typeof styling.market)} className="block w-full px-3 py-2 bg-background border border-border rounded-md text-[12px] text-foreground">
                <option value="global">Global / conservative</option><option value="eu_uk">EU / UK</option><option value="us">United States</option><option value="canada">Canada</option><option value="australia">Australia</option>
              </select>
            </label>
            <label className="space-y-1 text-[10px] text-muted-foreground">Disclosure version
              <input value={styling.consentVersion} onChange={(e) => setStyling({ ...styling, consentVersion: e.target.value })} className="block w-full px-3 py-2 bg-background border border-border rounded-md text-[12px] text-foreground" />
            </label>
          </div>
          {fields.some((field) => field.name === "phone") && <textarea value={styling.smsDisclosure} onChange={(e) => { const smsDisclosure=e.target.value; setStyling({ ...styling, smsDisclosure }); setFields(fields.map((field) => field.name === "consent_sms" ? { ...field, label: smsDisclosure } : field)); }} rows={4} className="w-full px-3 py-2 bg-background border border-border rounded-md text-[12px] text-foreground" aria-label="SMS consent disclosure" />}
          <p className="text-[11px] leading-5 text-muted-foreground">Email and SMS choices stay independent. SMS delivery remains disabled; this form only builds an auditable consented audience.</p>
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
              <div className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[12px] font-sans">Discount code</div>
            </div>
              <div className="space-y-1"><span className="text-[10px] text-muted-foreground">Format</span><select value={incentive.mode} onChange={e=>setIncentive({...incentive,mode:e.target.value as "fixed"|"spin"})} className="w-full px-3 py-1.5 bg-background border border-border rounded-md text-[12px]"><option value="fixed">Fixed reward</option><option value="spin">Spin-to-win</option></select></div>
              {incentive.mode==="fixed"&&<>
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
              </>}
              {incentive.mode==="spin"&&<div className="col-span-3 space-y-2"><p className="text-[11px] text-muted-foreground">The server chooses one weighted outcome using cryptographic randomness. Visitors can play once per form.</p>{incentive.spinOutcomes.map((outcome,index)=><div key={index} className="grid grid-cols-[1fr_90px_90px] gap-2"><input value={outcome.label} onChange={e=>setIncentive({...incentive,spinOutcomes:incentive.spinOutcomes.map((o,i)=>i===index?{...o,label:e.target.value}:o)})} className="rounded-md border border-border bg-background px-3 py-2 text-[12px]"/><input aria-label="Weight" type="number" min="1" value={outcome.weight} onChange={e=>setIncentive({...incentive,spinOutcomes:incentive.spinOutcomes.map((o,i)=>i===index?{...o,weight:Number(e.target.value)}:o)})} className="rounded-md border border-border bg-background px-3 py-2 text-[12px]"/><input aria-label="Discount" type="number" min="0" value={outcome.discountValue} onChange={e=>setIncentive({...incentive,spinOutcomes:incentive.spinOutcomes.map((o,i)=>i===index?{...o,discountValue:Number(e.target.value)}:o)})} className="rounded-md border border-border bg-background px-3 py-2 text-[12px]"/></div>)}</div>}
              <label className="col-span-3 flex items-center gap-2 text-[11px] text-muted-foreground"><input type="checkbox" checked={incentive.allowKnownCustomers} onChange={e=>setIncentive({...incentive,allowKnownCustomers:e.target.checked})}/>Also reward already-subscribed or recent buyers (normally suppressed)</label>
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
                <span className="text-[10px] font-sans text-muted-foreground">Format</span>
                <select
                  value={popupPosition}
                  onChange={(e) => setPopupPosition(e.target.value as typeof popupPosition)}
                  className="w-full px-3 py-1.5 bg-background border border-border rounded-md text-[12px] font-sans"
                >
                  <option value="center">Modal popup</option>
                  <option value="bottom-right">Bottom-right flyout</option>
                  <option value="bottom-left">Bottom-left flyout</option>
                  <option value="top-bar">Announcement bar</option>
                </select>
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
        {createPopup&&<label className="flex items-start gap-2 rounded-lg border border-border bg-card p-4 text-[12px]"><input type="checkbox" checked={experimentEnabled} onChange={e=>setExperimentEnabled(e.target.checked)} className="mt-0.5"/><span><strong>Start with a randomized popup test</strong><br/><span className="text-muted-foreground">10% see no popup; the rest split between the default and a delayed variant. Reporting stays marked early until each arm has enough exposure.</span></span></label>}
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
      {(createFormMut.error || createPopupMut.error) && (
        <p role="alert" className="text-[12px] text-destructive">
          {createFormMut.error?.message ?? createPopupMut.error?.message}
        </p>
      )}
    </div>
  );
}
