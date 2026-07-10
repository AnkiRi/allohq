// AI Gateway — single entry point for all model calls
export { complete, AI_MODELS, DEFAULT_MODEL, MODEL_COSTS, computeTokenCost, getProvider, llmRequestContext, isDemoLlmRequest } from "./ai";
export type {
  AIModelId,
  AITask,
  AIProvider,
  AIModel,
  ModelTier,
  ModelCost,
  LlmProvider,
  ProviderRequest,
  ProviderResult,
  CompletionRequest,
  CompletionResult,
} from "./ai";

// RFM
export { scoreQuintile, getSegmentName, computeRfmRawData } from "./rfm";
export { calculateCustomerLtv } from "./ltv";
export { DEFAULT_SEGMENTS } from "./segments";
export { analyzeBasketPatterns, saveBasketArchetypes, generateArchetypeName } from "./segments";
export type { BasketPattern } from "./segments";
export { discoverProductSegments, saveProductSegments } from "./segments";
export type { ProductSegmentDefinition } from "./segments";
export type {
  RfmSegmentName,
  SegmentDefinition,
  CustomerOrderData,
  RfmRawData,
  LtvResult,
} from "./types";

// Brand Intelligence
export { analyzeBrandVoice, analyzeBrandFromDocument } from "./brand";
export type { StoreData, BrandVoiceResult } from "./brand";

// AI Content Generation
export { generateEmail } from "./content";
export type { GenerateEmailInput, GenerateEmailOutput, CreativeIntensity, BrandSettings } from "./content";
export { renderBrandedEmail, loadBrandKit } from "./content";
export type { RenderBrandedEmailInput } from "./content";
export { generateWhatsApp } from "./content";
export type { GenerateWhatsAppInput, GenerateWhatsAppOutput } from "./content";
export { generateSms } from "./content";
export type { GenerateSmsInput, GenerateSmsOutput } from "./content";
export { generateRcs } from "./content";
export type { GenerateRcsInput, GenerateRcsOutput, RcsAction } from "./content";

export { LAYOUT_TEMPLATES, getLayoutById } from "./content";
export type { LayoutTemplate } from "./content";

// Context Engine
export { getUpcomingFestivities, getFunnelStage, getEmailIntent } from "./context";
export type { Festivity, FunnelStage, EmailIntent, IntentContext } from "./context";

// Program Planner
export { recommendPrograms, activateProgram, generateWorkflow } from "./programs";
export type { StoreAnalysis, ProgramRecommendation, ActivateProgramInput, GenerateWorkflowInput, GenerateWorkflowOutput } from "./programs";

// Image Generation
export { generateImage } from "./images";
export type { GenerateImageInput, GenerateImageOutput } from "./images";

// Natural Language Instructions
export { parseInstruction, executeInstruction } from "./instruction";
export type { InstructionIntent, ParsedInstruction, ExecutionResult } from "./instruction";

// Churn Prediction Model
export { predictChurn } from "./churn-model";
export type { ChurnModelInput, ChurnPrediction } from "./churn-model";

// Send Time Optimization
export { getOptimalSendTime } from "./send-time-optimizer";
export type { SendTimeResult } from "./send-time-optimizer";

export { hardChecks, judgeContent, evalContent, blocksToText } from "./eval/content-quality";
export type { EvalContent, BrandContext, JudgeVerdict, ContentEvalResult } from "./eval/content-quality";
