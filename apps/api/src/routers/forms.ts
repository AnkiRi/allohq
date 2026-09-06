import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure, storeProcedure } from "../trpc";
import { verifyStoreScopedAccess } from "../lib/storeAccess";
import type { FormField, FormStyling, IncentiveConfig, PopupTriggerConfig, PopupStyling } from "@allohq/forms-and-popups";

const fieldSchema = z.object({
  name: z.string().trim().min(1).max(80).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  type: z.enum(["text", "email", "phone", "select", "checkbox"]),
  label: z.string().trim().min(1).max(240),
  required: z.boolean(),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
  step: z.number().int().min(1).max(5).optional(),
  traitKey: z.string().trim().max(80).regex(/^[a-zA-Z][a-zA-Z0-9_.-]*$/).optional(),
});

function assertSendableAcquisitionForm(fields: FormField[]) {
  const email = fields.find((field) => field.name === "email" && field.type === "email");
  const consent = fields.find(
    (field) => field.name === "consent_email" && field.type === "checkbox" && field.required,
  );
  if (!email?.required || !consent) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Email signup forms require a mandatory email field and an explicit email-consent checkbox.",
    });
  }
  const hasPhone = fields.some((field) => field.type === "phone" && field.name === "phone");
  const smsConsent = fields.find((field) => field.name === "consent_sms" && field.type === "checkbox");
  if (hasPhone && !smsConsent) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Phone capture requires a separate SMS-consent checkbox." });
  }
}

const stylingSchema = z.object({
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
  buttonColor: z.string().optional(),
  buttonTextColor: z.string().optional(),
  buttonText: z.string().optional(),
  borderRadius: z.string().optional(),
  fontFamily: z.string().optional(),
  consentVersion: z.string().trim().min(1).max(40).optional(),
  market: z.enum(["global", "eu_uk", "us", "canada", "australia"]).optional(),
  smsDisclosure: z.string().trim().min(20).max(1000).optional(),
}).optional();

const incentiveSchema = z.object({
  type: z.literal("discount"),
  discountType: z.enum(["percentage", "fixed_amount"]).optional(),
  discountValue: z.number().positive().max(1_000_000).optional(),
  code: z.string().trim().min(3).max(40).regex(/^[A-Z0-9-]+$/).optional(),
}).optional();

export const formsRouter = router({
  // ── Forms CRUD ──

  listForms: storeProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.form.findMany({
        where: { storeId: input.storeId },
        include: {
          popups: { select: { id: true, name: true, status: true, trigger: true } },
          _count: { select: { submissions: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  getForm: workspaceProcedure
    .input(z.object({ formId: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyStoreScopedAccess(ctx, "form", input.formId);
      return ctx.prisma.form.findUnique({
        where: { id: input.formId },
        include: {
          popups: true,
          _count: { select: { submissions: true } },
        },
      });
    }),

  createForm: storeProcedure
    .input(
      z.object({
        storeId: z.string(),
        name: z.string(),
        fields: z.array(fieldSchema),
        styling: stylingSchema,
        submitAction: z.string().optional(),
        incentiveConfig: incentiveSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertSendableAcquisitionForm(input.fields as FormField[]);
      return ctx.prisma.form.create({
        data: {
          storeId: input.storeId,
          name: input.name,
          fields: JSON.parse(JSON.stringify(input.fields)),
          styling: input.styling ? JSON.parse(JSON.stringify(input.styling)) : undefined,
          submitAction: input.submitAction ?? "subscribe",
          incentiveConfig: input.incentiveConfig
            ? JSON.parse(JSON.stringify(input.incentiveConfig))
            : undefined,
          status: "draft",
        },
      });
    }),

  updateForm: workspaceProcedure
    .input(
      z.object({
        formId: z.string(),
        name: z.string().optional(),
        fields: z.array(fieldSchema).optional(),
        styling: stylingSchema,
        submitAction: z.string().optional(),
        incentiveConfig: incentiveSchema,
        status: z.enum(["draft", "active", "archived"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyStoreScopedAccess(ctx, "form", input.formId);
      const { formId, ...data } = input;
      const current = await ctx.prisma.form.findUniqueOrThrow({ where: { id: formId }, select: { fields: true } });
      if (data.status === "active" || data.fields) {
        assertSendableAcquisitionForm((data.fields ?? current.fields) as unknown as FormField[]);
      }
      return ctx.prisma.form.update({
        where: { id: formId },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.fields && { fields: JSON.parse(JSON.stringify(data.fields)) }),
          ...(data.styling && { styling: JSON.parse(JSON.stringify(data.styling)) }),
          ...(data.submitAction && { submitAction: data.submitAction }),
          ...(data.incentiveConfig && {
            incentiveConfig: JSON.parse(JSON.stringify(data.incentiveConfig)),
          }),
          ...(data.status && { status: data.status }),
        },
      });
    }),

  deleteForm: workspaceProcedure
    .input(z.object({ formId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await verifyStoreScopedAccess(ctx, "form", input.formId);
      await ctx.prisma.form.delete({ where: { id: input.formId } });
      return { success: true };
    }),

  // ── Popups CRUD ──

  listPopups: storeProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.popup.findMany({
        where: { storeId: input.storeId },
        include: {
          form: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  getPopup: workspaceProcedure
    .input(z.object({ popupId: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyStoreScopedAccess(ctx, "popup", input.popupId);
      return ctx.prisma.popup.findUnique({
        where: { id: input.popupId },
        include: { form: true },
      });
    }),

  createPopup: storeProcedure
    .input(
      z.object({
        storeId: z.string(),
        name: z.string(),
        formId: z.string(),
        trigger: z.enum(["exit_intent", "scroll", "timer", "page_load"]),
        triggerConfig: z.object({
          scrollPercent: z.number().optional(),
          delayMs: z.number().optional(),
          pageUrl: z.string().optional(),
          frequencyDays: z.number().int().min(0).max(365).optional(),
        }).optional(),
        styling: z.object({
          position: z.enum(["center", "bottom-left", "bottom-right", "top-bar"]).optional(),
          overlayColor: z.string().optional(),
          width: z.string().optional(),
          animation: z.enum(["fade", "slide-up", "slide-down", "scale"]).optional(),
        }).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const form = await ctx.prisma.form.findFirst({
        where: { id: input.formId, storeId: input.storeId },
        select: { id: true },
      });
      if (!form) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Form does not belong to this store" });
      }
      return ctx.prisma.popup.create({
        data: {
          storeId: input.storeId,
          name: input.name,
          formId: input.formId,
          trigger: input.trigger,
          triggerConfig: input.triggerConfig
            ? JSON.parse(JSON.stringify(input.triggerConfig))
            : undefined,
          styling: input.styling
            ? JSON.parse(JSON.stringify(input.styling))
            : undefined,
          status: "draft",
        },
      });
    }),

  updatePopup: workspaceProcedure
    .input(
      z.object({
        popupId: z.string(),
        name: z.string().optional(),
        trigger: z.enum(["exit_intent", "scroll", "timer", "page_load"]).optional(),
        triggerConfig: z.object({
          scrollPercent: z.number().optional(),
          delayMs: z.number().optional(),
          pageUrl: z.string().optional(),
          frequencyDays: z.number().int().min(0).max(365).optional(),
        }).optional(),
        styling: z.object({
          position: z.enum(["center", "bottom-left", "bottom-right", "top-bar"]).optional(),
          overlayColor: z.string().optional(),
          width: z.string().optional(),
          animation: z.enum(["fade", "slide-up", "slide-down", "scale"]).optional(),
        }).optional(),
        status: z.enum(["draft", "active", "paused", "archived"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyStoreScopedAccess(ctx, "popup", input.popupId);
      const { popupId, ...data } = input;
      if (data.status === "active") {
        const popup = await ctx.prisma.popup.findUniqueOrThrow({
          where: { id: popupId },
          include: { form: { select: { fields: true, status: true } } },
        });
        if (popup.form.status !== "active") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Activate the signup form before its popup." });
        }
        assertSendableAcquisitionForm(popup.form.fields as unknown as FormField[]);
      }
      return ctx.prisma.popup.update({
        where: { id: popupId },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.trigger && { trigger: data.trigger }),
          ...(data.triggerConfig && {
            triggerConfig: JSON.parse(JSON.stringify(data.triggerConfig)),
          }),
          ...(data.styling && {
            styling: JSON.parse(JSON.stringify(data.styling)),
          }),
          ...(data.status && { status: data.status }),
        },
      });
    }),

  deletePopup: workspaceProcedure
    .input(z.object({ popupId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await verifyStoreScopedAccess(ctx, "popup", input.popupId);
      await ctx.prisma.popup.delete({ where: { id: input.popupId } });
      return { success: true };
    }),

  // ── Submissions ──

  listSubmissions: workspaceProcedure
    .input(
      z.object({
        formId: z.string(),
        limit: z.number().optional(),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await verifyStoreScopedAccess(ctx, "form", input.formId);
      return ctx.prisma.formSubmission.findMany({
        where: { formId: input.formId },
        include: {
          customer: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
        orderBy: { capturedAt: "desc" },
        take: input.limit ?? 50,
        ...(input.cursor
          ? { skip: 1, cursor: { id: input.cursor } }
          : {}),
      });
    }),

  submissionStats: workspaceProcedure
    .input(z.object({ formId: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyStoreScopedAccess(ctx, "form", input.formId);
      const total = await ctx.prisma.formSubmission.count({
        where: { formId: input.formId },
      });
      const today = await ctx.prisma.formSubmission.count({
        where: {
          formId: input.formId,
          capturedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      });
      const thisWeek = await ctx.prisma.formSubmission.count({
        where: {
          formId: input.formId,
          capturedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      });
      return { total, today, thisWeek };
    }),

  // ── Embed Code ──

  getEmbedCode: storeProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findUniqueOrThrow({
        where: { id: input.storeId },
        select: { shopDomain: true },
      });
      const popups = await ctx.prisma.popup.findMany({
        where: { storeId: input.storeId, status: "active" },
        select: { id: true },
      });

      const apiUrl = process.env["API_URL"] ?? "https://api.joonhq.com";
      const popupIds = popups.map((p) => p.id);

      const clientId = process.env["SHOPIFY_API_KEY"];
      if (!clientId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Shopify theme activation is not configured for this environment.",
        });
      }
      const activationUrl = `https://${store.shopDomain}/admin/themes/current/editor?context=apps&activateAppId=${clientId}/signup-forms`;
      return { activationUrl, popupIds, apiUrl };
    }),

  // ── Public endpoint for widget to fetch popup config ──

  getActivePopups: storeProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const popups = await ctx.prisma.popup.findMany({
        where: { storeId: input.storeId, status: "active" },
        include: { form: true },
      });

      return popups.map((popup) => ({
        popupId: popup.id,
        formId: popup.form.id,
        formFields: popup.form.fields as unknown as FormField[],
        formStyling: (popup.form.styling as unknown as FormStyling) ?? {},
        incentiveConfig: popup.form.incentiveConfig as unknown as IncentiveConfig | null,
        trigger: popup.trigger,
        triggerConfig: (popup.triggerConfig as unknown as PopupTriggerConfig) ?? {},
        styling: (popup.styling as unknown as PopupStyling) ?? {},
      }));
    }),
});
