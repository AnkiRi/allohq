import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import type { FormField, FormStyling, IncentiveConfig, PopupTriggerConfig, PopupStyling } from "@allohq/forms-and-popups";

const fieldSchema = z.object({
  name: z.string(),
  type: z.enum(["text", "email", "phone", "select", "checkbox"]),
  label: z.string(),
  required: z.boolean(),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
});

const stylingSchema = z.object({
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
  buttonColor: z.string().optional(),
  buttonTextColor: z.string().optional(),
  buttonText: z.string().optional(),
  borderRadius: z.string().optional(),
  fontFamily: z.string().optional(),
}).optional();

const incentiveSchema = z.object({
  type: z.enum(["discount", "freeShipping"]),
  discountType: z.enum(["percentage", "fixed_amount"]).optional(),
  discountValue: z.number().optional(),
  code: z.string().optional(),
}).optional();

export const formsRouter = router({
  // ── Forms CRUD ──

  listForms: workspaceProcedure
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
      return ctx.prisma.form.findUnique({
        where: { id: input.formId },
        include: {
          popups: true,
          _count: { select: { submissions: true } },
        },
      });
    }),

  createForm: workspaceProcedure
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
      const { formId, ...data } = input;
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
      await ctx.prisma.form.delete({ where: { id: input.formId } });
      return { success: true };
    }),

  // ── Popups CRUD ──

  listPopups: workspaceProcedure
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
      return ctx.prisma.popup.findUnique({
        where: { id: input.popupId },
        include: { form: true },
      });
    }),

  createPopup: workspaceProcedure
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
      const { popupId, ...data } = input;
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

  getEmbedCode: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const popups = await ctx.prisma.popup.findMany({
        where: { storeId: input.storeId, status: "active" },
        select: { id: true },
      });

      const apiUrl = process.env["API_URL"] ?? "https://api.allo.so";
      const popupIds = popups.map((p) => p.id);

      const script = `<!-- Allo Popup Widget -->
<script>
(function() {
  var s = document.createElement('script');
  s.src = '${apiUrl}/widget/popup.js';
  s.async = true;
  s.dataset.storeId = '${input.storeId}';
  s.dataset.popups = '${popupIds.join(",")}';
  s.dataset.apiUrl = '${apiUrl}';
  document.head.appendChild(s);
})();
</script>`;

      return { script, popupIds };
    }),

  // ── Public endpoint for widget to fetch popup config ──

  getActivePopups: workspaceProcedure
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
