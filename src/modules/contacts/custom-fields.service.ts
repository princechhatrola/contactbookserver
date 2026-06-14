import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseTenantRepository } from '../../common/repositories/base-tenant.repository';
import { CustomFieldDefinition, CustomFieldDefinitionDocument, CustomFieldType } from './schemas/custom-field-definition.schema';
import { CreateCustomFieldDefinitionDto } from './dto/create-custom-field-definition.dto';

@Injectable()
export class CustomFieldsService extends BaseTenantRepository<CustomFieldDefinitionDocument> {
  constructor(
    @InjectModel(CustomFieldDefinition.name)
    private readonly customFieldDefinitionModel: Model<CustomFieldDefinitionDocument>,
  ) {
    super(customFieldDefinitionModel);
  }

  async createDefinition(orgId: string, dto: CreateCustomFieldDefinitionDto): Promise<CustomFieldDefinitionDocument> {
    const existing = await this.findOne(orgId, { key: dto.key });
    if (existing) {
      throw new ConflictException(`Custom field with key "${dto.key}" already exists for this organization.`);
    }

    if ((dto.type === CustomFieldType.DROPDOWN || dto.type === CustomFieldType.MULTI_SELECT) && (!dto.options || dto.options.length === 0)) {
      throw new BadRequestException(`Dropdown and Multi Select custom fields require options to be specified.`);
    }

    return this.create(orgId, {
      ...dto,
      options: dto.options || [],
    });
  }

  async getDefinitions(orgId: string): Promise<CustomFieldDefinitionDocument[]> {
    return this.find(orgId);
  }

  async deleteDefinition(orgId: string, id: string): Promise<void> {
    const deleted = await this.delete(orgId, id);
    if (!deleted) {
      throw new BadRequestException('Custom field definition not found or does not belong to this organization.');
    }
  }

  /**
   * Validates dynamic custom fields values object against the defined schemas.
   * Modifies/normalizes values where appropriate (e.g. parsing numbers or booleans).
   */
  async validateCustomFields(orgId: string, customFields: Record<string, any> = {}): Promise<Record<string, any>> {
    const definitions = await this.getDefinitions(orgId);
    const defMap = new Map<string, CustomFieldDefinitionDocument>();
    definitions.forEach((d) => defMap.set(d.key, d));

    const validatedFields: Record<string, any> = {};

    // 1. Check for required definitions that are missing in payload
    for (const [key, def] of defMap.entries()) {
      if (def.required) {
        const val = customFields[key];
        if (val === undefined || val === null || val === '') {
          throw new BadRequestException(`Custom field "${def.label}" (${key}) is required.`);
        }
      }
    }

    // 2. Validate all provided fields
    for (const [key, value] of Object.entries(customFields)) {
      const def = defMap.get(key);
      if (!def) {
        throw new BadRequestException(`Custom field key "${key}" is not defined for this organization.`);
      }

      // Ignore null / undefined / empty values if not required
      if (value === undefined || value === null || value === '') {
        continue;
      }

      let parsedValue = value;

      switch (def.type) {
        case CustomFieldType.TEXT:
        case CustomFieldType.TEXT_AREA:
          if (typeof value !== 'string') {
            parsedValue = String(value);
          }
          break;

        case CustomFieldType.NUMBER:
          const num = Number(value);
          if (isNaN(num)) {
            throw new BadRequestException(`Custom field "${def.label}" must be a number. Received: ${value}`);
          }
          parsedValue = num;
          break;

        case CustomFieldType.BOOLEAN:
          if (typeof value === 'string') {
            if (value.toLowerCase() === 'true' || value === '1') parsedValue = true;
            else if (value.toLowerCase() === 'false' || value === '0') parsedValue = false;
            else {
              throw new BadRequestException(`Custom field "${def.label}" must be a boolean. Received: ${value}`);
            }
          } else if (typeof value !== 'boolean') {
            parsedValue = Boolean(value);
          }
          break;

        case CustomFieldType.DATE:
          const timestamp = Date.parse(value);
          if (isNaN(timestamp)) {
            throw new BadRequestException(`Custom field "${def.label}" must be a valid date string. Received: ${value}`);
          }
          parsedValue = new Date(timestamp);
          break;

        case CustomFieldType.DROPDOWN:
          if (typeof value !== 'string' || !def.options.includes(value)) {
            throw new BadRequestException(`Custom field "${def.label}" must be one of the specified options: [${def.options.join(', ')}]. Received: ${value}`);
          }
          break;

        case CustomFieldType.MULTI_SELECT:
          const valuesArray = Array.isArray(value) ? value : [value];
          for (const item of valuesArray) {
            if (typeof item !== 'string' || !def.options.includes(item)) {
              throw new BadRequestException(`Custom field "${def.label}" items must be one of the specified options: [${def.options.join(', ')}]. Received: ${item}`);
            }
          }
          parsedValue = valuesArray;
          break;

        case CustomFieldType.EMAIL:
          if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            throw new BadRequestException(`Custom field "${def.label}" must be a valid email address. Received: ${value}`);
          }
          break;

        case CustomFieldType.PHONE:
          if (typeof value !== 'string' || !/^\+?[0-9\s\-()]{7,20}$/.test(value)) {
            throw new BadRequestException(`Custom field "${def.label}" must be a valid phone number. Received: ${value}`);
          }
          break;

        case CustomFieldType.URL:
          if (typeof value !== 'string') {
            throw new BadRequestException(`Custom field "${def.label}" must be a valid URL string.`);
          }
          try {
            if (!value.startsWith('http://') && !value.startsWith('https://')) {
              parsedValue = `https://${value}`;
            }
            new URL(parsedValue);
          } catch {
            throw new BadRequestException(`Custom field "${def.label}" is not a valid URL. Received: ${value}`);
          }
          break;
      }

      validatedFields[key] = parsedValue;
    }

    return validatedFields;
  }
}
