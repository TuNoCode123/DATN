import { Test, TestingModule } from "@nestjs/testing";
import { ChatService } from "./chat.service";
import { PrismaService } from "../prisma/prisma.service";
import { ChatUploadService } from "./chat-upload.service";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ConversationType, MemberRole, MessageType } from "@prisma/client";

const mockPrismaService = () => ({
  conversation: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
  },
  conversationMember: {
    findUnique: jest.fn(),
    createMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  message: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
});

describe("ChatService", () => {
  let service: ChatService;
  let prisma: ReturnType<typeof mockPrismaService>;

  beforeEach(async () => {
    prisma = mockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ChatService, { provide: PrismaService, useValue: prisma }, { provide: ChatUploadService, useValue: { generatePresignedUrl: jest.fn(), signUrl: jest.fn() } }],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  // ─── assertMember ─────────────────────────────────

  describe("assertMember", () => {
    it("should return member if found", async () => {
      const member = {
        id: "m1",
        conversationId: "c1",
        userId: "u1",
        role: MemberRole.MEMBER,
      };
      prisma.conversationMember.findUnique.mockResolvedValue(member);

      const result = await service.assertMember("c1", "u1");
      expect(result).toEqual(member);
      expect(prisma.conversationMember.findUnique).toHaveBeenCalledWith({
        where: {
          conversationId_userId: { conversationId: "c1", userId: "u1" },
        },
      });
    });

    it("should throw ForbiddenException if not a member", async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(service.assertMember("c1", "u1")).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── assertAdmin ──────────────────────────────────

  describe("assertAdmin", () => {
    it("should return member if admin", async () => {
      const member = {
        id: "m1",
        conversationId: "c1",
        userId: "u1",
        role: MemberRole.ADMIN,
      };
      prisma.conversationMember.findUnique.mockResolvedValue(member);

      const result = await service.assertAdmin("c1", "u1");
      expect(result).toEqual(member);
    });

    it("should throw ForbiddenException if member but not admin", async () => {
      const member = {
        id: "m1",
        conversationId: "c1",
        userId: "u1",
        role: MemberRole.MEMBER,
      };
      prisma.conversationMember.findUnique.mockResolvedValue(member);

      await expect(service.assertAdmin("c1", "u1")).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("should throw ForbiddenException if not a member at all", async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(service.assertAdmin("c1", "u1")).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── getOrCreateDirect ────────────────────────────

  describe("getOrCreateDirect", () => {
    it("should throw BadRequestException if no targetUserId", async () => {
      await expect(service.getOrCreateDirect("u1", undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw BadRequestException for self-conversation", async () => {
      await expect(service.getOrCreateDirect("u1", "u1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw NotFoundException if target user not found", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getOrCreateDirect("u1", "u2")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should upsert a direct conversation with sorted user IDs", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "u2", isActive: true });
      const expectedConv = {
        id: "c1",
        type: ConversationType.DIRECT,
        members: [],
      };
      prisma.conversation.upsert.mockResolvedValue(expectedConv);

      const result = await service.getOrCreateDirect("u2", "u1");

      expect(prisma.conversation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            directUserA_directUserB: { directUserA: "u1", directUserB: "u2" },
          },
          create: expect.objectContaining({
            type: ConversationType.DIRECT,
            directUserA: "u1",
            directUserB: "u2",
          }),
        }),
      );
      expect(result).toEqual(expectedConv);
    });
  });

  // ─── createGroup ──────────────────────────────────

  describe("createGroup", () => {
    it("should throw BadRequestException if no name", async () => {
      await expect(
        service.createGroup("u1", {
          type: ConversationType.GROUP,
          memberIds: ["u2"],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException if no memberIds or empty", async () => {
      await expect(
        service.createGroup("u1", {
          type: ConversationType.GROUP,
          name: "Test",
          memberIds: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw NotFoundException if some members do not exist", async () => {
      prisma.user.findMany.mockResolvedValue([{ id: "u2" }]); // only 1 found
      await expect(
        service.createGroup("u1", {
          type: ConversationType.GROUP,
          name: "Test",
          memberIds: ["u2", "u3"],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("should create a group conversation with admin and members", async () => {
      prisma.user.findMany.mockResolvedValue([{ id: "u2" }, { id: "u3" }]);
      const expectedConv = {
        id: "c1",
        type: ConversationType.GROUP,
        name: "Team",
        members: [],
      };
      prisma.conversation.create.mockResolvedValue(expectedConv);

      const result = await service.createGroup("u1", {
        type: ConversationType.GROUP,
        name: "Team",
        memberIds: ["u2", "u3"],
      });

      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: {
          type: ConversationType.GROUP,
          name: "Team",
          createdBy: "u1",
          members: {
            create: [
              { userId: "u1", role: MemberRole.ADMIN },
              { userId: "u2", role: MemberRole.MEMBER },
              { userId: "u3", role: MemberRole.MEMBER },
            ],
          },
        },
        include: expect.any(Object),
      });
      expect(result).toEqual(expectedConv);
    });

    it("should filter out currentUserId from memberIds", async () => {
      prisma.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
      prisma.conversation.create.mockResolvedValue({ id: "c1", members: [] });

      await service.createGroup("u1", {
        type: ConversationType.GROUP,
        name: "Team",
        memberIds: ["u1", "u2"],
      });

      const createCall = prisma.conversation.create.mock.calls[0][0];
      const memberCreates = createCall.data.members.create;
      // u1 should only appear once as ADMIN
      const u1Entries = memberCreates.filter((m: any) => m.userId === "u1");
      expect(u1Entries).toHaveLength(1);
      expect(u1Entries[0].role).toBe(MemberRole.ADMIN);
    });
  });

  // ─── createConversation ───────────────────────────

  describe("createConversation", () => {
    it("should call getOrCreateDirect for DIRECT type", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "u2", isActive: true });
      prisma.conversation.upsert.mockResolvedValue({
        id: "c1",
        type: "DIRECT",
      });

      await service.createConversation("u1", {
        type: ConversationType.DIRECT,
        memberId: "u2",
      });

      expect(prisma.conversation.upsert).toHaveBeenCalled();
    });

    it("should call createGroup for GROUP type", async () => {
      prisma.user.findMany.mockResolvedValue([{ id: "u2" }]);
      prisma.conversation.create.mockResolvedValue({ id: "c1", type: "GROUP" });

      await service.createConversation("u1", {
        type: ConversationType.GROUP,
        name: "Team",
        memberIds: ["u2"],
      });

      expect(prisma.conversation.create).toHaveBeenCalled();
    });
  });

  // ─── listConversations ────────────────────────────

  describe("listConversations", () => {
    it("should return paginated conversations with unread counts", async () => {
      const conversations = [
        {
          id: "c1",
          type: ConversationType.DIRECT,
          name: null,
          avatarUrl: null,
          lastMessageSeq: 5,
          updatedAt: new Date(),
          members: [
            {
              userId: "u1",
              lastReadSeq: 3,
              role: MemberRole.MEMBER,
              user: { id: "u1", displayName: "User1", avatarUrl: null },
            },
            {
              userId: "u2",
              lastReadSeq: 0,
              role: MemberRole.MEMBER,
              user: { id: "u2", displayName: "User2", avatarUrl: null },
            },
          ],
          messages: [
            {
              id: "msg1",
              content: "Hello",
              type: MessageType.TEXT,
              senderId: "u2",
              sender: { id: "u2", displayName: "User2", avatarUrl: null },
              createdAt: new Date(),
            },
          ],
        },
      ];

      prisma.conversation.findMany.mockResolvedValue(conversations);
      prisma.conversation.count.mockResolvedValue(1);

      const result = await service.listConversations("u1", 1, 20);

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].unreadCount).toBe(2); // 5 - 3
      expect(result.data[0].lastMessage).toBeDefined();
      expect(result.data[0].lastMessage!.content).toBe("Hello");
    });

    it("should exclude self from DIRECT conversation members", async () => {
      const conversations = [
        {
          id: "c1",
          type: ConversationType.DIRECT,
          name: null,
          avatarUrl: null,
          lastMessageSeq: 0,
          updatedAt: new Date(),
          members: [
            {
              userId: "u1",
              lastReadSeq: 0,
              role: MemberRole.MEMBER,
              user: { id: "u1", displayName: "User1", avatarUrl: null },
            },
            {
              userId: "u2",
              lastReadSeq: 0,
              role: MemberRole.MEMBER,
              user: { id: "u2", displayName: "User2", avatarUrl: null },
            },
          ],
          messages: [],
        },
      ];

      prisma.conversation.findMany.mockResolvedValue(conversations);
      prisma.conversation.count.mockResolvedValue(1);

      const result = await service.listConversations("u1");

      expect(result.data[0].members).toHaveLength(1);
      expect(result.data[0].members[0].userId).toBe("u2");
    });

    it("should return null lastMessage when no messages", async () => {
      const conversations = [
        {
          id: "c1",
          type: ConversationType.GROUP,
          name: "Team",
          avatarUrl: null,
          lastMessageSeq: 0,
          updatedAt: new Date(),
          members: [
            {
              userId: "u1",
              lastReadSeq: 0,
              role: MemberRole.ADMIN,
              user: { id: "u1", displayName: "User1", avatarUrl: null },
            },
          ],
          messages: [],
        },
      ];

      prisma.conversation.findMany.mockResolvedValue(conversations);
      prisma.conversation.count.mockResolvedValue(1);

      const result = await service.listConversations("u1");
      expect(result.data[0].lastMessage).toBeNull();
    });

    it("should clamp unreadCount to 0 minimum", async () => {
      const conversations = [
        {
          id: "c1",
          type: ConversationType.GROUP,
          name: "Team",
          avatarUrl: null,
          lastMessageSeq: 3,
          updatedAt: new Date(),
          members: [
            {
              userId: "u1",
              lastReadSeq: 5,
              role: MemberRole.MEMBER,
              user: { id: "u1", displayName: "User1", avatarUrl: null },
            },
          ],
          messages: [],
        },
      ];

      prisma.conversation.findMany.mockResolvedValue(conversations);
      prisma.conversation.count.mockResolvedValue(1);

      const result = await service.listConversations("u1");
      expect(result.data[0].unreadCount).toBe(0);
    });
  });

  // ─── getConversation ──────────────────────────────

  describe("getConversation", () => {
    it("should return conversation if user is a member", async () => {
      const conv = {
        id: "c1",
        type: ConversationType.GROUP,
        members: [
          {
            userId: "u1",
            user: { id: "u1", displayName: "User1", avatarUrl: null },
          },
        ],
      };
      prisma.conversation.findUnique.mockResolvedValue(conv);

      const result = await service.getConversation("c1", "u1");
      expect(result).toEqual(conv);
    });

    it("should throw NotFoundException if conversation not found", async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.getConversation("c1", "u1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw ForbiddenException if user is not a member", async () => {
      const conv = {
        id: "c1",
        type: ConversationType.GROUP,
        members: [
          {
            userId: "u2",
            user: { id: "u2", displayName: "User2", avatarUrl: null },
          },
        ],
      };
      prisma.conversation.findUnique.mockResolvedValue(conv);

      await expect(service.getConversation("c1", "u1")).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── updateGroup ──────────────────────────────────

  describe("updateGroup", () => {
    it("should update group name and avatarUrl", async () => {
      // getConversation mock
      prisma.conversation.findUnique.mockResolvedValue({
        id: "c1",
        type: ConversationType.GROUP,
        members: [
          {
            userId: "u1",
            role: MemberRole.ADMIN,
            user: { id: "u1", displayName: "User1", avatarUrl: null },
          },
        ],
      });
      // assertAdmin mock
      prisma.conversationMember.findUnique.mockResolvedValue({
        id: "m1",
        conversationId: "c1",
        userId: "u1",
        role: MemberRole.ADMIN,
      });
      prisma.conversation.update.mockResolvedValue({
        id: "c1",
        name: "New Name",
      });

      const result = await service.updateGroup("c1", "u1", {
        name: "New Name",
        avatarUrl: "http://img.png",
      });

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: { name: "New Name", avatarUrl: "http://img.png" },
        include: expect.any(Object),
      });
      expect(result).toEqual({ id: "c1", name: "New Name" });
    });

    it("should throw BadRequestException if conversation is DIRECT", async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: "c1",
        type: ConversationType.DIRECT,
        members: [{ userId: "u1" }],
      });

      await expect(
        service.updateGroup("c1", "u1", { name: "New" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw ForbiddenException if user is not admin", async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: "c1",
        type: ConversationType.GROUP,
        members: [
          {
            userId: "u1",
            role: MemberRole.MEMBER,
            user: { id: "u1", displayName: "User1", avatarUrl: null },
          },
        ],
      });
      prisma.conversationMember.findUnique.mockResolvedValue({
        id: "m1",
        conversationId: "c1",
        userId: "u1",
        role: MemberRole.MEMBER,
      });

      await expect(
        service.updateGroup("c1", "u1", { name: "New" }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── addMembers ───────────────────────────────────

  describe("addMembers", () => {
    beforeEach(() => {
      // getConversation mock
      prisma.conversation.findUnique.mockResolvedValue({
        id: "c1",
        type: ConversationType.GROUP,
        members: [
          {
            userId: "u1",
            role: MemberRole.ADMIN,
            user: { id: "u1", displayName: "Admin", avatarUrl: null },
          },
        ],
      });
      // assertAdmin mock
      prisma.conversationMember.findUnique.mockResolvedValue({
        id: "m1",
        conversationId: "c1",
        userId: "u1",
        role: MemberRole.ADMIN,
      });
    });

    it("should add members and return added list", async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: "u2", displayName: "User2", isActive: true },
        { id: "u3", displayName: "User3", isActive: true },
      ]);
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        displayName: "Admin",
      });
      prisma.conversationMember.createMany.mockResolvedValue({ count: 2 });

      // Mock $transaction for system messages
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          conversation: {
            update: jest.fn().mockResolvedValue({ lastMessageSeq: 1 }),
          },
          message: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.addMembers("c1", "u1", ["u2", "u3"]);

      expect(prisma.conversationMember.createMany).toHaveBeenCalledWith({
        data: [
          { conversationId: "c1", userId: "u2" },
          { conversationId: "c1", userId: "u3" },
        ],
        skipDuplicates: true,
      });
      expect(result.added).toHaveLength(2);
      expect(result.added[0]).toEqual({ userId: "u2", displayName: "User2" });
    });

    it("should throw NotFoundException if some users not found", async () => {
      prisma.user.findMany.mockResolvedValue([{ id: "u2" }]); // only 1 of 2

      await expect(
        service.addMembers("c1", "u1", ["u2", "u3"]),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException if conversation is DIRECT", async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: "c1",
        type: ConversationType.DIRECT,
        members: [{ userId: "u1" }],
      });

      await expect(service.addMembers("c1", "u1", ["u2"])).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── removeMember ─────────────────────────────────

  describe("removeMember", () => {
    beforeEach(() => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: "c1",
        type: ConversationType.GROUP,
        members: [
          {
            userId: "u1",
            role: MemberRole.ADMIN,
            user: { id: "u1", displayName: "Admin", avatarUrl: null },
          },
          {
            userId: "u2",
            role: MemberRole.MEMBER,
            user: { id: "u2", displayName: "User2", avatarUrl: null },
          },
        ],
      });
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          conversation: {
            update: jest.fn().mockResolvedValue({ lastMessageSeq: 1 }),
          },
          message: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });
    });

    it("should allow admin to remove another member", async () => {
      // assertAdmin
      prisma.conversationMember.findUnique.mockResolvedValue({
        id: "m1",
        conversationId: "c1",
        userId: "u1",
        role: MemberRole.ADMIN,
      });
      prisma.conversationMember.delete.mockResolvedValue({});
      prisma.conversationMember.count.mockResolvedValue(1);
      prisma.user.findUnique.mockResolvedValue({
        id: "u2",
        displayName: "User2",
      });

      const result = await service.removeMember("c1", "u1", "u2");
      expect(result).toEqual({ message: "Member removed" });
      expect(prisma.conversationMember.delete).toHaveBeenCalled();
    });

    it("should allow a member to remove themselves (leave)", async () => {
      // assertMember for self - first call checks u2 is member (from assertAdmin skip for self), second for target
      prisma.conversationMember.findUnique.mockResolvedValue({
        id: "m2",
        conversationId: "c1",
        userId: "u2",
        role: MemberRole.MEMBER,
      });
      prisma.conversationMember.delete.mockResolvedValue({});
      prisma.conversationMember.count.mockResolvedValue(1);
      prisma.user.findUnique.mockResolvedValue({
        id: "u2",
        displayName: "User2",
      });

      const result = await service.removeMember("c1", "u2", "u2");
      expect(result).toEqual({ message: "Member removed" });
    });

    it("should delete conversation if last member leaves", async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({
        id: "m1",
        conversationId: "c1",
        userId: "u1",
        role: MemberRole.ADMIN,
      });
      prisma.conversationMember.delete.mockResolvedValue({});
      prisma.conversationMember.count.mockResolvedValue(0);
      prisma.conversation.delete.mockResolvedValue({});

      const result = await service.removeMember("c1", "u1", "u1");
      expect(result).toEqual({ message: "Conversation deleted" });
      expect(prisma.conversation.delete).toHaveBeenCalledWith({
        where: { id: "c1" },
      });
    });

    it("should promote oldest member if admin leaves and no admins remain", async () => {
      // Conversation where u1 is the only admin
      prisma.conversation.findUnique.mockResolvedValue({
        id: "c1",
        type: ConversationType.GROUP,
        members: [
          {
            userId: "u1",
            role: MemberRole.ADMIN,
            user: { id: "u1", displayName: "Admin", avatarUrl: null },
          },
          {
            userId: "u2",
            role: MemberRole.MEMBER,
            user: { id: "u2", displayName: "User2", avatarUrl: null },
          },
          {
            userId: "u3",
            role: MemberRole.MEMBER,
            user: { id: "u3", displayName: "User3", avatarUrl: null },
          },
        ],
      });
      prisma.conversationMember.findUnique.mockResolvedValue({
        id: "m1",
        conversationId: "c1",
        userId: "u1",
        role: MemberRole.ADMIN,
      });
      prisma.conversationMember.delete.mockResolvedValue({});
      prisma.conversationMember.count
        .mockResolvedValueOnce(2) // remaining count
        .mockResolvedValueOnce(0); // admins left count
      prisma.conversationMember.findFirst.mockResolvedValue({
        id: "m2",
        conversationId: "c1",
        userId: "u2",
        role: MemberRole.MEMBER,
      });
      prisma.conversationMember.update.mockResolvedValue({});
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        displayName: "Admin",
      });

      await service.removeMember("c1", "u1", "u1");

      expect(prisma.conversationMember.update).toHaveBeenCalledWith({
        where: { id: "m2" },
        data: { role: MemberRole.ADMIN },
      });
    });

    it("should throw BadRequestException if conversation is DIRECT", async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: "c1",
        type: ConversationType.DIRECT,
        members: [{ userId: "u1" }, { userId: "u2" }],
      });

      await expect(service.removeMember("c1", "u1", "u2")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── createMessage ────────────────────────────────

  describe("createMessage", () => {
    it("should create a message with incremented seqNumber via transaction", async () => {
      const mockMessage = {
        id: "msg1",
        conversationId: "c1",
        senderId: "u1",
        type: MessageType.TEXT,
        content: "Hello",
        clientId: "client1",
        seqNumber: 1,
        sender: { id: "u1", displayName: "User1", avatarUrl: null },
      };

      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          conversation: {
            update: jest.fn().mockResolvedValue({ lastMessageSeq: 1 }),
          },
          message: {
            create: jest.fn().mockResolvedValue(mockMessage),
          },
        };
        return fn(tx);
      });

      const result = await service.createMessage(
        "c1",
        "u1",
        "Hello",
        MessageType.TEXT,
        "client1",
      );
      expect(result).toEqual(mockMessage);
    });

    it("should return existing message on duplicate clientId (P2002)", async () => {
      const existingMessage = {
        id: "msg1",
        conversationId: "c1",
        content: "Hello",
        clientId: "client1",
      };

      prisma.$transaction.mockRejectedValue({
        code: "P2002",
        meta: { target: ["conversationId", "clientId"] },
      });
      prisma.message.findFirst.mockResolvedValue(existingMessage);

      const result = await service.createMessage(
        "c1",
        "u1",
        "Hello",
        MessageType.TEXT,
        "client1",
      );
      expect(result).toEqual(existingMessage);
      expect(prisma.message.findFirst).toHaveBeenCalledWith({
        where: { conversationId: "c1", clientId: "client1" },
        include: {
          reactions: true,
          sender: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      });
    });

    it("should rethrow non-P2002 errors", async () => {
      prisma.$transaction.mockRejectedValue(new Error("DB_ERROR"));

      await expect(
        service.createMessage("c1", "u1", "Hello", MessageType.TEXT, "client1"),
      ).rejects.toThrow("DB_ERROR");
    });
  });

  // ─── createSystemMessage ──────────────────────────

  describe("createSystemMessage", () => {
    it("should create a system message via transaction", async () => {
      const mockMessage = {
        id: "msg1",
        senderId: "SYSTEM",
        type: MessageType.SYSTEM,
        content: "User joined",
        seqNumber: 1,
      };

      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          conversation: {
            update: jest.fn().mockResolvedValue({ lastMessageSeq: 1 }),
          },
          message: {
            create: jest.fn().mockResolvedValue(mockMessage),
          },
        };
        return fn(tx);
      });

      const result = await service.createSystemMessage("c1", "User joined");
      expect(result).toEqual(mockMessage);
    });
  });

  // ─── getMessages ──────────────────────────────────

  describe("getMessages", () => {
    it("should return messages with hasMore=false when fewer than limit", async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({
        id: "m1",
        userId: "u1",
      });
      const messages = [
        { id: "msg2", content: "World", reactions: [] },
        { id: "msg1", content: "Hello", reactions: [] },
      ];
      prisma.message.findMany.mockResolvedValue(messages);

      const result = await service.getMessages("c1", "u1", 30);

      expect(result.hasMore).toBe(false);
      expect(result.data).toHaveLength(2);
    });

    it("should return hasMore=true and pop last when more than limit", async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({
        id: "m1",
        userId: "u1",
      });
      // Return limit+1 items
      const messages = Array.from({ length: 4 }, (_, i) => ({
        id: `msg${i}`,
        content: `Msg ${i}`,
        reactions: [],
      }));
      prisma.message.findMany.mockResolvedValue(messages);

      const result = await service.getMessages("c1", "u1", 3);

      expect(result.hasMore).toBe(true);
      expect(result.data).toHaveLength(3);
    });

    it("should apply before cursor when provided", async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({
        id: "m1",
        userId: "u1",
      });
      prisma.message.findMany.mockResolvedValue([]);

      await service.getMessages("c1", "u1", 30, "cursor123");

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ conversationId: "c1", id: { lt: "cursor123" } }),
        }),
      );
    });

    it("should throw ForbiddenException if not a member", async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);

      await expect(service.getMessages("c1", "u1")).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── markRead ─────────────────────────────────────

  describe("markRead", () => {
    it("should update lastReadSeq", async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: "c1",
        lastMessageSeq: 10,
      });
      prisma.conversationMember.findUnique.mockResolvedValue({
        id: "m1",
        conversationId: "c1",
        userId: "u1",
        lastReadSeq: 3,
      });
      prisma.conversationMember.update.mockResolvedValue({ lastReadSeq: 7 });

      const result = await service.markRead("c1", "u1", 7);

      expect(result).toEqual({ lastReadSeq: 7 });
      expect(prisma.conversationMember.update).toHaveBeenCalledWith({
        where: {
          conversationId_userId: { conversationId: "c1", userId: "u1" },
        },
        data: { lastReadSeq: 7 },
      });
    });

    it("should throw NotFoundException if conversation not found", async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.markRead("c1", "u1", 5)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should not update if seqNumber exceeds lastMessageSeq", async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: "c1",
        lastMessageSeq: 5,
      });
      prisma.conversationMember.findUnique.mockResolvedValue({
        id: "m1",
        conversationId: "c1",
        userId: "u1",
        lastReadSeq: 3,
      });

      const result = await service.markRead("c1", "u1", 10);

      expect(result).toEqual({ lastReadSeq: 3 });
      expect(prisma.conversationMember.update).not.toHaveBeenCalled();
    });

    it("should not update if seqNumber is less than current lastReadSeq", async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: "c1",
        lastMessageSeq: 10,
      });
      prisma.conversationMember.findUnique.mockResolvedValue({
        id: "m1",
        conversationId: "c1",
        userId: "u1",
        lastReadSeq: 7,
      });

      const result = await service.markRead("c1", "u1", 5);

      expect(result).toEqual({ lastReadSeq: 7 });
      expect(prisma.conversationMember.update).not.toHaveBeenCalled();
    });

    it("should throw ForbiddenException if not a member", async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: "c1",
        lastMessageSeq: 10,
      });
      prisma.conversationMember.findUnique.mockResolvedValue(null);

      await expect(service.markRead("c1", "u1", 5)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
