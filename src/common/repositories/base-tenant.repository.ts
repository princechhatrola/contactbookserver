import { Model, UpdateQuery, QueryOptions, Document, QueryFilter, Types } from 'mongoose';

export class BaseTenantRepository<T extends Document> {
  constructor(protected readonly model: Model<T>) {}

  protected getScopedFilter(orgId: string, filter: QueryFilter<T> = {}): QueryFilter<T> {
    // If orgId is not provided (e.g. Super Admin query with bypass), return raw filter
    if (!orgId) return filter;
    const organizationId = Types.ObjectId.isValid(orgId) ? new Types.ObjectId(orgId) : orgId;
    return { ...filter, organizationId } as any;
  }

  async find(orgId: string, filter: QueryFilter<T> = {}, options?: QueryOptions): Promise<T[]> {
    return this.model.find(this.getScopedFilter(orgId, filter), null, options).exec();
  }

  async findOne(orgId: string, filter: QueryFilter<T>, options?: QueryOptions): Promise<T | null> {
    return this.model.findOne(this.getScopedFilter(orgId, filter), null, options).exec();
  }

  async findById(orgId: string, id: string): Promise<T | null> {
    return this.model.findOne(this.getScopedFilter(orgId, { _id: id } as any)).exec();
  }

  async create(orgId: string, doc: Partial<T>): Promise<T> {
    const organizationId = Types.ObjectId.isValid(orgId) ? new Types.ObjectId(orgId) : orgId;
    const created = new this.model({
      ...doc,
      organizationId,
    });
    return created.save() as Promise<T>;
  }

  async update(orgId: string, id: string, update: UpdateQuery<T>): Promise<T | null> {
    return this.model
      .findOneAndUpdate(
        this.getScopedFilter(orgId, { _id: id } as any),
        update,
        { new: true },
      )
      .exec();
  }

  async delete(orgId: string, id: string): Promise<T | null> {
    return this.model.findOneAndDelete(this.getScopedFilter(orgId, { _id: id } as any)).exec();
  }

  async count(orgId: string, filter: QueryFilter<T> = {}): Promise<number> {
    return this.model.countDocuments(this.getScopedFilter(orgId, filter)).exec();
  }
}
