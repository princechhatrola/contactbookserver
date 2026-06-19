import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schemas/user.schema';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(userData: Partial<User>): Promise<UserDocument> {
    if (userData.email) {
      const existing = await this.userModel.findOne({ email: userData.email.toLowerCase() });
      if (existing) {
        throw new ConflictException(`User with email ${userData.email} already exists`);
      }
    }

    // Hash password if provided
    let passwordHash = userData.passwordHash;
    if (userData.passwordHash && !userData.passwordHash.startsWith('$2b$')) {
      passwordHash = await bcrypt.hash(userData.passwordHash, 12);
    }

    const createdUser = new this.userModel({
      ...userData,
      email: userData.email?.toLowerCase(),
      passwordHash,
    });

    return createdUser.save();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async update(id: string, updateData: Partial<User>): Promise<UserDocument> {
    // If updating email, check for conflicts
    if (updateData.email) {
      const normalizedEmail = updateData.email.toLowerCase();
      const existing = await this.userModel.findOne({ email: normalizedEmail, _id: { $ne: id } });
      if (existing) {
        throw new ConflictException(`User with email ${updateData.email} already exists`);
      }
      updateData.email = normalizedEmail;
    }

    // If updating password, hash it
    if (updateData.passwordHash && !updateData.passwordHash.startsWith('$2b$')) {
      updateData.passwordHash = await bcrypt.hash(updateData.passwordHash, 12);
    }

    const updated = await this.userModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
    if (!updated) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return updated;
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<UserDocument> {
    const user = await this.findById(id);
    const updateData: Partial<User> = {};

    if (dto.firstName) updateData.firstName = dto.firstName;
    if (dto.lastName) updateData.lastName = dto.lastName;

    if (dto.password) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Current password is required to change password');
      }
      const passwordMatches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!passwordMatches) {
        throw new BadRequestException('Invalid current password');
      }
      updateData.passwordHash = await bcrypt.hash(dto.password, 12);
    }

    const updated = await this.userModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
    if (!updated) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return updated;
  }

  async updateRefreshToken(userId: string, refreshToken: string | null): Promise<void> {
    const refreshTokenHash = refreshToken ? await bcrypt.hash(refreshToken, 10) : undefined;
    await this.userModel.findByIdAndUpdate(userId, { refreshTokenHash }).exec();
  }

  async findByOrganization(orgId: string): Promise<UserDocument[]> {
    return this.userModel.find({ organizationId: new Types.ObjectId(orgId) }).exec();
  }

  async delete(id: string): Promise<void> {
    const result = await this.userModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
  }
}
