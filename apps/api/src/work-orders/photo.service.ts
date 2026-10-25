import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PhotoKind } from "@prisma/client";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { OrganizationContext, PrismaService } from "../prisma/prisma.service";
import { WorkOrderService } from "./work-order.service";
import { orderVisibility } from "../resources/visibility";
import { event } from "../realtime/events";
@Injectable()
export class PhotoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: WorkOrderService,
  ) {}
  async upload(
    context: OrganizationContext,
    id: string,
    version: number,
    kind: PhotoKind,
    file?: Express.Multer.File,
  ) {
    if (!file || file.size > 5 * 1024 * 1024)
      throw new BadRequestException("Image required, maximum 5 MB");
    const data = file.buffer;
    const signature =
      (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) ||
      data
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      (data.toString("ascii", 0, 4) === "RIFF" &&
        data.toString("ascii", 8, 12) === "WEBP");
    if (!signature)
      throw new BadRequestException(
        "A valid JPEG, PNG or WebP image is required",
      );
    let bytes: Buffer;
    try {
      const input = sharp(file.buffer, {
        limitInputPixels: 20_000_000,
        animated: false,
      });
      const metadata = await input.metadata();
      if (
        !["jpeg", "png", "webp"].includes(metadata.format ?? "") ||
        (metadata.pages ?? 1) > 1
      )
        throw new Error();
      bytes = await input
        .rotate()
        .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new BadRequestException(
        "A valid JPEG, PNG or WebP image is required",
      );
    }
    return this.prisma.forOrganization(context, async (tx) => {
      const { actor, order, assignment } = await this.orders.assigned(
        tx,
        context,
        id,
      );
      if (
        !assignment.acceptedAt ||
        !["ASSIGNED", "IN_PROGRESS"].includes(order.status) ||
        (kind === "AFTER" && order.status !== "IN_PROGRESS")
      )
        throw new ConflictException("Photo cannot be added at this stage");
      if (
        (await tx.attachment.count({
          where: { assignmentId: assignment.id },
        })) >= 20
      )
        throw new ConflictException("Maximum 20 photos per assignment");
      await this.orders.bump(tx, id, version);
      const attachmentId = randomUUID();
      const attachment = await tx.attachment.create({
        data: {
          id: attachmentId,
          organizationId: context.organizationId,
          workOrderId: id,
          assignmentId: assignment.id,
          uploadedById: actor.id,
          kind,
          fileName: `${kind.toLowerCase()}.webp`,
          storageKey: `database/${attachmentId}`,
          mimeType: "image/webp",
          sizeBytes: bytes.length,
        },
      });
      await tx.photoContent.create({
        data: {
          organizationId: context.organizationId,
          attachmentId,
          bytes: new Uint8Array(bytes),
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorId: actor.id,
          entityType: "WorkOrder",
          entityId: id,
          action: "PHOTO_UPLOADED",
          metadata: { attachmentId, kind, assignmentId: assignment.id },
        },
      });
      await event(
        tx,
        context.organizationId,
        "WorkOrder",
        id,
        "photo.uploaded",
        version + 1,
      );
      return attachment;
    });
  }
  content(context: OrganizationContext, id: string) {
    return this.prisma.forOrganization(context, async (tx) => {
      const member = await tx.membership.findFirstOrThrow({
        where: { userId: context.actorId },
        include: { role: true },
      });
      const photo = await tx.photoContent.findFirst({
        where: {
          attachmentId: id,
          attachment: { workOrder: { is: orderVisibility(member) } },
        },
        select: { bytes: true },
      });
      if (!photo) throw new NotFoundException();
      return Buffer.from(photo.bytes);
    });
  }
}
