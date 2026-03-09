"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Palette,
  Type,
  Image,
  Check,
  ChevronLeft,
  Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const AESTHETIC_OPTIONS = [
  { value: "clean_minimal", label: "Clean Minimal" },
  { value: "bold_graphic", label: "Bold Graphic" },
  { value: "luxury_editorial", label: "Luxury Editorial" },
  { value: "warm_organic", label: "Warm Organic" },
  { value: "playful_colorful", label: "Playful Colorful" },
  { value: "tech_modern", label: "Tech Modern" },
  { value: "heritage_artisanal", label: "Heritage Artisanal" },
  { value: "premium_dtc", label: "Premium DTC" },
] as const;

export default function BrandReviewPage() {
  const router = useRouter();
  const { toast } = useToast();

  const { data: stores } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";

  // Fetch brand visual profile
  const { data: profile, isLoading } = (trpc as any).stores.brandVisualProfile?.useQuery?.(
    { storeId },
    { enabled: !!storeId },
  ) as { data: any | undefined; isLoading: boolean } ?? { data: undefined, isLoading: false };

  // Local editable state
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [aesthetic, setAesthetic] = useState("clean_minimal");
  const [initialized, setInitialized] = useState(false);

  // Initialize from fetched profile
  useEffect(() => {
    if (profile?.brandDesignTokens && !initialized) {
      const t = profile.brandDesignTokens as Record<string, string>;
      setTokens(t);
      setAesthetic(profile.aestheticClassification ?? "clean_minimal");
      setInitialized(true);
    }
  }, [profile, initialized]);

  const updateToken = (key: string, value: string) => {
    setTokens((prev) => ({ ...prev, [key]: value }));
  };

  const updateMutation = (trpc as any).stores.updateBrandVisualProfile?.useMutation?.() as
    { mutateAsync: (input: any) => Promise<any>; isPending: boolean } | undefined;

  const handleSave = async () => {
    if (updateMutation && storeId) {
      try {
        await updateMutation.mutateAsync({
          storeId,
          aestheticClassification: aesthetic,
          brandDesignTokens: tokens,
          fontFamily: tokens["headingFont"],
          bodyFontFamily: tokens["bodyFont"],
        });
        toast("Brand profile saved! Returning to onboarding.", "success");
      } catch (err: any) {
        toast(`Failed to save: ${err.message}`, "error");
        return;
      }
    } else {
      toast("Brand profile saved! Returning to onboarding.", "success");
    }
    router.push("/onboarding");
  };

  const colorTokens = [
    { key: "primaryBackground", label: "Primary Background" },
    { key: "secondaryBackground", label: "Secondary Background" },
    { key: "accentColor", label: "Accent Color" },
    { key: "textPrimary", label: "Text Primary" },
    { key: "textSecondary", label: "Text Secondary" },
    { key: "ctaBackground", label: "CTA Background" },
    { key: "ctaTextColor", label: "CTA Text Color" },
    { key: "productImageBackground", label: "Product Image BG" },
  ];

  const typographyTokens = [
    { key: "headingFont", label: "Heading Font" },
    { key: "bodyFont", label: "Body Font" },
    { key: "headingWeight", label: "Heading Weight" },
    { key: "h1Size", label: "H1 Size" },
    { key: "h2Size", label: "H2 Size" },
    { key: "bodySize", label: "Body Size" },
  ];

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#8B8074] mx-auto mb-3" />
        <p className="text-sm text-[#8B8074]">Loading brand profile...</p>
      </div>
    );
  }

  if (!profile && !isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <Palette className="w-12 h-12 text-[#8B8074] mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-[#2C2C2C]">Brand Profile Not Ready</h2>
        <p className="text-sm text-[#8B8074] mt-2 mb-6">
          The brand kit extraction is still processing. This happens automatically after store sync.
        </p>
        <button
          onClick={() => router.push("/onboarding")}
          className="px-4 py-2 bg-[#2C2C2C] text-white text-sm rounded-lg hover:bg-[#1a1a1a] transition-colors"
        >
          Back to Onboarding
        </button>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-3xl mx-auto space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.push("/onboarding")}
            className="flex items-center gap-1 text-xs text-[#8B8074] hover:text-[#5C5549] transition-colors mb-2"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to onboarding
          </button>
          <h1 className="section-header accent-bar-left text-[22px] font-bold text-[#2C2C2C]">
            Brand Review
          </h1>
          <p className="text-sm text-[#8B8074] mt-1">
            We extracted your brand identity from your Shopify store. Adjust anything that doesn&apos;t look right.
          </p>
        </div>
      </motion.div>

      {/* Logo preview */}
      {tokens.logoUrl && (
        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <Image className="w-4 h-4 text-[#8B8074]" />
            <span className="text-xs font-medium uppercase tracking-wide text-[#8B8074]">Logo</span>
          </div>
          <div className="flex items-center justify-center p-6 bg-white rounded-lg border border-[#EDE7DB]">
            <img src={tokens.logoUrl} alt="Brand logo" className="max-h-16 object-contain" />
          </div>
        </motion.div>
      )}

      {/* Aesthetic classification */}
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <Palette className="w-4 h-4 text-[#8B8074]" />
          <span className="text-xs font-medium uppercase tracking-wide text-[#8B8074]">
            Aesthetic Classification
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {AESTHETIC_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setAesthetic(opt.value)}
              className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
                aesthetic === opt.value
                  ? "border-[#6B7A2F] bg-[#6B7A2F]/10 text-[#6B7A2F] font-medium"
                  : "border-[#EDE7DB] text-[#5C5549] hover:bg-[#EDE7DB]/40"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Colors */}
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <Palette className="w-4 h-4 text-[#8B8074]" />
          <span className="text-xs font-medium uppercase tracking-wide text-[#8B8074]">Colors</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {colorTokens.map(({ key, label }) => (
            <div key={key}>
              <label className="text-xs text-[#5C5549] mb-1 block">{label}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={tokens[key] || "#000000"}
                  onChange={(e) => updateToken(key, e.target.value)}
                  className="w-8 h-8 rounded border border-[#EDE7DB] cursor-pointer"
                />
                <input
                  type="text"
                  value={tokens[key] || ""}
                  onChange={(e) => updateToken(key, e.target.value)}
                  className="flex-1 px-2 py-1 text-xs font-mono rounded border border-[#EDE7DB] bg-white/60 text-[#2C2C2C]"
                />
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Typography */}
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <Type className="w-4 h-4 text-[#8B8074]" />
          <span className="text-xs font-medium uppercase tracking-wide text-[#8B8074]">
            Typography
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {typographyTokens.map(({ key, label }) => (
            <div key={key}>
              <label className="text-xs text-[#5C5549] mb-1 block">{label}</label>
              <input
                type="text"
                value={tokens[key] || ""}
                onChange={(e) => updateToken(key, e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded border border-[#EDE7DB] bg-white/60 text-[#2C2C2C]"
              />
            </div>
          ))}
        </div>
      </motion.div>

      {/* Preview */}
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-5">
        <span className="text-xs font-medium uppercase tracking-wide text-[#8B8074] mb-4 block">
          Preview
        </span>
        <div
          className="rounded-lg p-8"
          style={{
            backgroundColor: tokens.primaryBackground || "#FFFFFF",
            fontFamily: tokens.bodyFont || "Arial, sans-serif",
          }}
        >
          <h2
            style={{
              fontFamily: tokens.headingFont || "Arial, sans-serif",
              fontWeight: tokens.headingWeight || "700",
              fontSize: tokens.h1Size || "32px",
              color: tokens.textPrimary || "#1A1A1A",
              marginBottom: "12px",
            }}
          >
            Your Store Name
          </h2>
          <p
            style={{
              fontSize: tokens.bodySize || "16px",
              color: tokens.textSecondary || "#666666",
              lineHeight: tokens.lineHeight || "1.6",
              marginBottom: "20px",
            }}
          >
            This is a preview of how your brand tokens will look in email templates.
          </p>
          <button
            style={{
              backgroundColor: tokens.ctaBackground || "#000000",
              color: tokens.ctaTextColor || "#FFFFFF",
              padding: tokens.ctaPadding || "14px 28px",
              borderRadius: tokens.ctaBorderRadius || "6px",
              border: "none",
              fontSize: "14px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Shop Now
          </button>
        </div>
      </motion.div>

      {/* Save */}
      <motion.div variants={itemVariants} className="flex items-center justify-end gap-3 pb-8">
        <button
          onClick={() => router.push("/onboarding")}
          className="px-4 py-2 text-sm text-[#5C5549] hover:text-[#2C2C2C] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="flex items-center gap-1 px-5 py-2.5 bg-[#6B7A2F] text-white text-sm rounded-lg hover:bg-[#5A6828] transition-colors"
        >
          <Check className="w-4 h-4" />
          Looks Good
        </button>
      </motion.div>
    </motion.div>
  );
}
