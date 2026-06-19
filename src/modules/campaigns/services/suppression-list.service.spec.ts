import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { SuppressionListService } from './suppression-list.service';
import { SuppressionList, SuppressionReason } from '../schemas/suppression-list.schema';

const mockSuppression = {
  _id: '60c72b2f9b1d8b2a3c8d1099',
  organizationId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d1011'),
  email: 'suppressed@example.com',
  reason: SuppressionReason.MANUAL,
};

class MockSuppressionListModel {
  constructor(private data: any) {
    Object.assign(this, data);
  }
  static findOneAndUpdate = jest.fn();
  static deleteOne = jest.fn();
  static countDocuments = jest.fn();
  static find = jest.fn();
}

describe('SuppressionListService', () => {
  let service: SuppressionListService;
  let model: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuppressionListService,
        {
          provide: getModelToken(SuppressionList.name),
          useValue: MockSuppressionListModel,
        },
      ],
    }).compile();

    service = module.get<SuppressionListService>(SuppressionListService);
    model = module.get(getModelToken(SuppressionList.name));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('add', () => {
    it('should successfully upsert suppressed email', async () => {
      const dto = {
        email: 'suppressed@example.com',
        reason: SuppressionReason.MANUAL,
      };

      model.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockSuppression,
          email: dto.email.toLowerCase(),
          reason: dto.reason,
        }),
      });

      const result = await service.add('60c72b2f9b1d8b2a3c8d1011', dto);
      expect(result).toBeDefined();
      expect(result.email).toBe('suppressed@example.com');
      expect(result.reason).toBe(SuppressionReason.MANUAL);
      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        {
          organizationId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d1011'),
          email: 'suppressed@example.com',
        },
        { reason: SuppressionReason.MANUAL },
        { upsert: true, new: true }
      );
    });
  });

  describe('removeEmail', () => {
    it('should successfully remove suppressed email if exists', async () => {
      model.deleteOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      });

      await expect(
        service.removeEmail('60c72b2f9b1d8b2a3c8d1011', 'suppressed@example.com')
      ).resolves.not.toThrow();

      expect(model.deleteOne).toHaveBeenCalledWith({
        organizationId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d1011'),
        email: 'suppressed@example.com',
      });
    });

    it('should throw BadRequestException if email is not found', async () => {
      model.deleteOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      });

      await expect(
        service.removeEmail('60c72b2f9b1d8b2a3c8d1011', 'missing@example.com')
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('isSuppressed', () => {
    it('should return true if email is suppressed', async () => {
      model.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      });

      const result = await service.isSuppressed('60c72b2f9b1d8b2a3c8d1011', 'suppressed@example.com');
      expect(result).toBe(true);
    });

    it('should return false if email is not suppressed', async () => {
      model.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });

      const result = await service.isSuppressed('60c72b2f9b1d8b2a3c8d1011', 'clean@example.com');
      expect(result).toBe(false);
    });
  });

  describe('filterSuppressed', () => {
    it('should return a set of matching suppressed emails', async () => {
      model.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([{ email: 'banned1@example.com' }, { email: 'banned2@example.com' }]),
      });

      const emailsInput = ['clean@example.com', 'banned1@example.com', 'banned2@example.com'];
      const result = await service.filterSuppressed('60c72b2f9b1d8b2a3c8d1011', emailsInput);

      expect(result).toBeInstanceOf(Set);
      expect(result.has('banned1@example.com')).toBe(true);
      expect(result.has('banned2@example.com')).toBe(true);
      expect(result.has('clean@example.com')).toBe(false);
      expect(result.size).toBe(2);
    });

    it('should return an empty set if input is empty', async () => {
      const result = await service.filterSuppressed('60c72b2f9b1d8b2a3c8d1011', []);
      expect(result.size).toBe(0);
    });
  });

  describe('getSuppressed', () => {
    it('should return paginated list and total count', async () => {
      model.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([mockSuppression]),
      });
      model.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      });

      const result = await service.getSuppressed('60c72b2f9b1d8b2a3c8d1011', { search: 'suppressed', page: 1, limit: 10 });

      expect(result.data.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });
  });
});
