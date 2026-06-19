import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Contact, ContactDocument } from '../contacts/schemas/contact.schema';
import { Lead, LeadDocument, LeadStatus } from '../leads/schemas/lead.schema';
import { Task, TaskDocument, TaskStatus } from '../tasks/schemas/task.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
    @InjectModel(Lead.name)
    private readonly leadModel: Model<LeadDocument>,
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async getMetrics(orgId: string) {
    const orgObjectId = new Types.ObjectId(orgId);

    const [totalContacts, totalLeads, leadStats, activeTasks] = await Promise.all([
      // 1. Total Contacts count
      this.contactModel.countDocuments({ organizationId: orgObjectId, isDeleted: { $ne: true } }).exec(),
      
      // 2. Total Leads count
      this.leadModel.countDocuments({ organizationId: orgObjectId }).exec(),

      // 3. Leads financial stats (Won vs Lost totals)
      this.leadModel.aggregate([
        { $match: { organizationId: orgObjectId } },
        {
          $group: {
            _id: null,
            totalWonValue: {
              $sum: {
                $cond: [{ $eq: ['$status', LeadStatus.WON] }, '$value', 0],
              },
            },
            totalLostValue: {
              $sum: {
                $cond: [{ $eq: ['$status', LeadStatus.LOST] }, '$value', 0],
              },
            },
            wonCount: {
              $sum: {
                $cond: [{ $eq: ['$status', LeadStatus.WON] }, 1, 0],
              },
            },
          },
        },
      ]).exec(),

      // 4. Active Tasks count (Pending & In Progress)
      this.taskModel.countDocuments({
        organizationId: orgObjectId,
        status: { $in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
      }).exec(),
    ]);

    const stats = leadStats[0] || { totalWonValue: 0, totalLostValue: 0, wonCount: 0 };
    const conversionRate = totalLeads > 0 ? Math.round((stats.wonCount / totalLeads) * 100) : 0;

    return {
      totalContacts,
      totalLeads,
      conversionRate,
      dealValueWon: stats.totalWonValue,
      dealValueLost: stats.totalLostValue,
      activeTasks,
    };
  }

  async getTeamPerformance(orgId: string) {
    const orgObjectId = new Types.ObjectId(orgId);

    // Aggregate contacts owned by each team member
    const contactAggregation = await this.contactModel.aggregate([
      { $match: { organizationId: orgObjectId, ownerId: { $ne: null }, isDeleted: { $ne: true } } },
      { $group: { _id: '$ownerId', contactsCount: { $sum: 1 } } },
    ]).exec();

    // Aggregate leads owned by each team member
    const leadAggregation = await this.leadModel.aggregate([
      { $match: { organizationId: orgObjectId, ownerId: { $ne: null } } },
      { $group: { _id: '$ownerId', leadsCount: { $sum: 1 }, totalValue: { $sum: '$value' } } },
    ]).exec();

    // Fetch user details for organization
    const users = await this.userModel.find({ organizationId: orgObjectId }).exec();

    // Combine results
    return users.map(user => {
      const contactData = contactAggregation.find(c => c._id && c._id.toString() === user._id.toString());
      const leadData = leadAggregation.find(l => l._id && l._id.toString() === user._id.toString());
      return {
        userId: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        contactsCount: contactData ? contactData.contactsCount : 0,
        leadsCount: leadData ? leadData.leadsCount : 0,
        leadsValue: leadData ? leadData.totalValue : 0,
      };
    });
  }

  async getLeadsByStage(orgId: string) {
    const orgObjectId = new Types.ObjectId(orgId);

    // Group leads by status/stage
    const stats = await this.leadModel.aggregate([
      { $match: { organizationId: orgObjectId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalValue: { $sum: '$value' },
        },
      },
      {
        $project: {
          stage: '$_id',
          count: 1,
          totalValue: 1,
          _id: 0,
        },
      },
    ]).exec();

    // Sort to keep order consistent with LeadStatus values
    const order = Object.values(LeadStatus);
    return stats.sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));
  }
}
