import { z } from "zod";

const id = z.string().min(1).max(200);
const color = z.string().max(100);
const url = z.string().max(4000);
const align = z.enum(["left", "center", "right"]);
const productSource = z.enum(["manual", "recommended", "trending", "cross_sell", "reorder"]);

const text = z.object({
  id,
  type: z.literal("text"),
  props: z.object({
    html: z.string().max(100_000),
    align: align.optional(),
    fontSize: z.number().min(8).max(96).optional(),
    color: color.optional(),
    fontFamily: z.string().max(200).optional(),
  }).passthrough(),
});

const image = z.object({
  id,
  type: z.literal("image"),
  props: z.object({
    src: url,
    alt: z.string().max(2000).optional(),
    width: z.number().min(0).max(4000).optional(),
    height: z.number().min(0).max(4000).optional(),
    href: url.optional(),
    align: align.optional(),
    fullWidth: z.boolean().optional(),
  }).passthrough(),
});

const button = z.object({
  id,
  type: z.literal("button"),
  props: z.object({
    text: z.string().max(2000),
    href: url,
    bgColor: color.optional(),
    textColor: color.optional(),
    borderRadius: z.number().min(0).max(100).optional(),
    align: align.optional(),
    fullWidth: z.boolean().optional(),
  }).passthrough(),
});

const divider = z.object({
  id,
  type: z.literal("divider"),
  props: z.object({
    color: color.optional(),
    thickness: z.number().min(0).max(20).optional(),
    margin: z.number().min(0).max(200).optional(),
  }).passthrough(),
});

const spacer = z.object({
  id,
  type: z.literal("spacer"),
  props: z.object({ height: z.number().min(0).max(1000) }).passthrough(),
});

const product = z.object({
  id,
  type: z.literal("product"),
  props: z.object({
    productId: z.string().max(500).default(""),
    /** Chosen variant, where the store has more than one. */
    variantId: z.string().max(500).optional(),
    showPrice: z.boolean().optional(),
    showDescription: z.boolean().optional(),
    showImage: z.boolean().optional(),
    buttonText: z.string().max(2000).optional(),
    buttonHref: url.optional(),
    source: productSource.optional(),
    title: z.string().max(5000).optional(),
    description: z.string().max(100_000).optional(),
    imageUrl: url.optional(),
    price: z.number().min(0).optional(),
  }).passthrough(),
});

const productGrid = z.object({
  id,
  type: z.literal("product_grid"),
  props: z.object({
    productIds: z.array(z.string().max(500)).max(100).default([]),
    /**
     * A LIVE binding: the grid renders whatever is in this collection at send
     * time, not a snapshot taken when it was bound. Resolved by
     * `resolveBlockData`, which preview, approval and delivery all call.
     */
    collectionId: z.string().max(500).optional(),
    /** How many of the collection's products to show. */
    collectionLimit: z.number().int().min(1).max(12).optional(),
    columns: z.union([z.literal(2), z.literal(3)]).optional(),
    showPrice: z.boolean().optional(),
    showDescription: z.boolean().optional(),
    source: productSource.optional(),
    dynamicProductCount: z.number().int().min(1).max(12).optional(),
  }).passthrough(),
});

const social = z.object({
  id,
  type: z.literal("social"),
  props: z.object({
    links: z.array(z.object({ platform: z.string().max(100), url })).max(20),
  }).passthrough(),
});

const header = z.object({
  id,
  type: z.literal("header"),
  props: z.object({
    logoSrc: url.optional(),
    logoAlt: z.string().max(2000).optional(),
    bgColor: color.optional(),
    align: align.optional(),
  }).passthrough(),
});

const footer = z.object({
  id,
  type: z.literal("footer"),
  props: z.object({
    text: z.string().max(100_000),
    unsubscribeText: z.string().max(2000).optional(),
  }).passthrough(),
});

const hero = z.object({
  id,
  type: z.literal("hero"),
  props: z.object({
    heading: z.string().max(20_000),
    subtext: z.string().max(100_000).optional(),
    buttonText: z.string().max(2000).optional(),
    buttonHref: url.optional(),
    bgColor: color.optional(),
    bgImageSrc: url.optional(),
    textColor: color.optional(),
    align: align.optional(),
  }).passthrough(),
});

const iconRow = z.object({
  id,
  type: z.literal("icon_row"),
  props: z.object({
    items: z.array(z.object({
      icon: z.string().max(1000),
      label: z.string().max(2000),
      description: z.string().max(10_000).optional(),
    })).min(1).max(8),
  }).passthrough(),
});

const countdown = z.object({
  id,
  type: z.literal("countdown"),
  props: z.object({
    endDate: z.string().max(200),
    label: z.string().max(2000),
    bgColor: color.optional(),
    textColor: color.optional(),
  }).passthrough(),
});

const testimonial = z.object({
  id,
  type: z.literal("testimonial"),
  props: z.object({
    quote: z.string().max(100_000),
    author: z.string().max(2000),
    rating: z.number().min(0).max(5).optional(),
    avatarUrl: url.optional(),
  }).passthrough(),
});

const customHtml = z.object({
  id,
  type: z.literal("custom_html"),
  props: z.object({
    html: z.string().max(250_000),
    label: z.string().max(200).optional(),
  }).passthrough(),
});

const leafBlockSchema = z.discriminatedUnion("type", [
  text, image, button, divider, spacer, product, productGrid, social, header,
  footer, hero, iconRow, countdown, testimonial, customHtml,
]);

export const emailBlockSchema: z.ZodType<any> = z.lazy(() => z.union([
  leafBlockSchema,
  z.object({
    id,
    type: z.literal("columns"),
    props: z.object({
      columns: z.array(z.array(emailBlockSchema).max(100)).min(1).max(4),
      columnWidths: z.array(z.number().min(0).max(100)).max(4).optional(),
    }).passthrough(),
  }),
]));

export const emailBlocksSchema = z.array(emailBlockSchema).max(500);

export const emailDocumentSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  envelope: z.object({
    subject: z.string().max(500),
    previewText: z.string().max(1000).default(""),
    fromName: z.string().max(500).optional(),
    replyTo: z.string().email().optional(),
    locale: z.string().max(35).default("en"),
  }),
  blocks: emailBlocksSchema,
  metadata: z.record(z.string()).default({}),
});

export type EmailDocument = z.infer<typeof emailDocumentSchema>;

const commandBase = { requestId: z.string().min(1).max(200).optional() };
export const emailCommandSchema = z.discriminatedUnion("type", [
  z.object({ ...commandBase, type: z.literal("replaceText"), blockId: id, field: z.string().max(100), value: z.string().max(100_000) }),
  z.object({ ...commandBase, type: z.literal("setStyle"), blockId: id, property: z.string().max(100), value: z.union([z.string(), z.number(), z.boolean(), z.null()]) }),
  z.object({ ...commandBase, type: z.literal("replaceAsset"), blockId: id, assetUrl: url, alt: z.string().max(2000).optional() }),
  z.object({ ...commandBase, type: z.literal("bindProduct"), blockId: id, productId: z.string().max(500), variantId: z.string().max(500).optional() }),
  z.object({ ...commandBase, type: z.literal("insertBlock"), afterBlockId: id.nullable(), block: emailBlockSchema }),
  z.object({ ...commandBase, type: z.literal("removeBlock"), blockId: id }),
  z.object({ ...commandBase, type: z.literal("moveBlock"), blockId: id, afterBlockId: id.nullable() }),
  z.object({ ...commandBase, type: z.literal("setEnvelope"), field: z.enum(["subject", "previewText", "fromName", "replyTo", "locale"]), value: z.string().max(5000) }),
]);

export const emailCommandListSchema = z.array(emailCommandSchema).min(1).max(100);
export type EmailCommand = z.infer<typeof emailCommandSchema>;
