import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import * as dns from 'dns';
import { BaseTenantRepository } from '../../../common/repositories/base-tenant.repository';
import { DomainAuthentication, DomainAuthenticationDocument } from '../schemas/domain-authentication.schema';
import { CreateDomainDto } from '../dto/create-domain.dto';
import { EncryptionService } from './encryption.service';

@Injectable()
export class DomainAuthenticationsService extends BaseTenantRepository<DomainAuthenticationDocument> {
  private readonly logger = new Logger(DomainAuthenticationsService.name);

  constructor(
    @InjectModel(DomainAuthentication.name)
    private readonly domainModel: Model<DomainAuthenticationDocument>,
    private readonly encryptionService: EncryptionService,
  ) {
    super(domainModel);
  }

  async createDomain(orgId: string, dto: CreateDomainDto): Promise<DomainAuthenticationDocument> {
    const domainName = dto.domain.toLowerCase().trim();

    // 1. Verify domain isn't already registered
    const existing = await this.domainModel.findOne({
      organizationId: new Types.ObjectId(orgId),
      domain: domainName,
      isDeleted: { $ne: true },
    }).exec();

    if (existing) {
      throw new BadRequestException(`Domain ${domainName} is already registered`);
    }

    // 2. Generate RSA 2048-bit keypair for DKIM signing
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    // 3. Clean headers/newlines from public key for DNS TXT format compatibility
    const dkimPublicKey = publicKey
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s+/g, '');

    // 4. Encrypt the private key securely using EncryptionService
    const encryptedPrivateKey = this.encryptionService.encrypt(privateKey);

    const domainData = {
      organizationId: new Types.ObjectId(orgId),
      domain: domainName,
      spfRecord: 'v=spf1 include:relay.contactflow.io ~all',
      spfVerified: false,
      dkimSelector: 'cf',
      dkimRecord: `v=DKIM1; k=rsa; p=${dkimPublicKey}`,
      dkimPrivateKey: encryptedPrivateKey,
      dkimPublicKey,
      dkimVerified: false,
      dmarcRecord: `v=DMARC1; p=none; rua=mailto:dmarc-reports@${domainName}`,
      dmarcVerified: false,
    };

    return this.create(orgId, domainData as any);
  }

  async getDomains(orgId: string): Promise<DomainAuthenticationDocument[]> {
    const domains = await this.domainModel.find({
      organizationId: new Types.ObjectId(orgId),
      isDeleted: { $ne: true },
    }).exec();

    return domains.map(d => {
      const doc = d.toObject() as any;
      delete doc.dkimPrivateKey;
      return doc;
    });
  }

  async getDomain(orgId: string, id: string): Promise<DomainAuthenticationDocument> {
    const domain = await this.domainModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(orgId),
      isDeleted: { $ne: true },
    }).exec();

    if (!domain) {
      throw new NotFoundException(`Domain with ID ${id} not found`);
    }

    const doc = domain.toObject() as any;
    delete doc.dkimPrivateKey;
    return doc;
  }

  async deleteDomain(orgId: string, id: string): Promise<void> {
    const result = await this.domainModel.updateOne(
      {
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(orgId),
        isDeleted: { $ne: true },
      },
      { isDeleted: true },
    ).exec();

    if (result.modifiedCount === 0) {
      throw new NotFoundException(`Domain with ID ${id} not found`);
    }
  }

  async verifyDomain(orgId: string, id: string): Promise<DomainAuthenticationDocument> {
    const domain = await this.domainModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(orgId),
      isDeleted: { $ne: true },
    }).exec();

    if (!domain) {
      throw new NotFoundException(`Domain with ID ${id} not found`);
    }

    let spfVerified = false;
    let dkimVerified = false;
    let dmarcVerified = false;

    // 1. Resolve SPF TXT records on the root domain
    try {
      const spfRecords = await dns.promises.resolveTxt(domain.domain);
      const flatSpf = spfRecords.map(chunks => chunks.join(''));
      spfVerified = flatSpf.some(r => r.startsWith('v=spf1') && r.includes('include:relay.contactflow.io'));
    } catch (err: any) {
      this.logger.debug(`SPF DNS resolve failed for ${domain.domain}: ${err.message}`);
    }

    // 2. Resolve DKIM TXT records on the selector subdomain (cf._domainkey.domain)
    try {
      const dkimRecords = await dns.promises.resolveTxt(`${domain.dkimSelector}._domainkey.${domain.domain}`);
      const flatDkim = dkimRecords.map(chunks => chunks.join(''));
      dkimVerified = flatDkim.some(r => r.startsWith('v=DKIM1') && r.includes(domain.dkimPublicKey));
    } catch (err: any) {
      this.logger.debug(`DKIM DNS resolve failed for cf._domainkey.${domain.domain}: ${err.message}`);
    }

    // 3. Resolve DMARC TXT records on the _dmarc subdomain (_dmarc.domain)
    try {
      const dmarcRecords = await dns.promises.resolveTxt(`_dmarc.${domain.domain}`);
      const flatDmarc = dmarcRecords.map(chunks => chunks.join(''));
      dmarcVerified = flatDmarc.some(r => r.startsWith('v=DMARC1'));
    } catch (err: any) {
      this.logger.debug(`DMARC DNS resolve failed for _dmarc.${domain.domain}: ${err.message}`);
    }

    // Update statuses
    domain.spfVerified = spfVerified;
    domain.dkimVerified = dkimVerified;
    domain.dmarcVerified = dmarcVerified;
    domain.lastCheckedAt = new Date();

    const saved = await domain.save();
    const doc = saved.toObject() as any;
    delete doc.dkimPrivateKey;
    return doc;
  }
}
