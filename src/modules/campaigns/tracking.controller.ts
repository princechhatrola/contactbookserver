import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as express from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { EmailEvent, EmailEventDocument } from './schemas/email-event.schema';
import { CampaignRecipient, CampaignRecipientDocument } from './schemas/campaign-recipient.schema';
import { Campaign, CampaignDocument } from './schemas/campaign.schema';
import { SuppressionListService } from './services/suppression-list.service';
import { SuppressionReason } from './schemas/suppression-list.schema';

@ApiTags('Engagement Tracking')
@Controller('tracking')
export class TrackingController {
  constructor(
    @InjectModel(EmailEvent.name)
    private readonly eventModel: Model<EmailEventDocument>,
    @InjectModel(CampaignRecipient.name)
    private readonly recipientModel: Model<CampaignRecipientDocument>,
    @InjectModel(Campaign.name)
    private readonly campaignModel: Model<CampaignDocument>,
    private readonly suppressionService: SuppressionListService,
  ) {}

  @Get('open')
  @Public()
  @ApiOperation({ summary: 'Track email open (Returns transparent 1x1 pixel)' })
  async trackOpen(
    @Query('campaignId') campaignId: string,
    @Query('recipientId') recipientId: string,
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    try {
      if (Types.ObjectId.isValid(campaignId) && Types.ObjectId.isValid(recipientId)) {
        const recipient = await this.recipientModel.findById(recipientId).exec();
        if (recipient) {
          const ipAddress = req.ip || req.socket.remoteAddress;
          const userAgent = req.headers['user-agent'] || '';
          const { browser, device } = this.parseUserAgent(userAgent);

          // Log Open Event
          await this.eventModel.create({
            organizationId: recipient.organizationId,
            campaignId: recipient.campaignId,
            recipientId: recipient._id,
            contactId: recipient.contactId,
            eventType: 'open',
            ipAddress,
            userAgent,
            browser,
            device,
          });

          // Update recipient status to opened if it was just 'sent'
          if (recipient.status === 'sent') {
            recipient.status = 'opened';
            recipient.openedAt = new Date();
            await recipient.save();
          }
        }
      }
    } catch (err) {
      console.error('Failed to log email open event:', err);
    }

    // Return transparent 1x1 pixel GIF
    const transparentPixel = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64',
    );
    res.set('Content-Type', 'image/gif');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.send(transparentPixel);
  }

  @Get('click')
  @Public()
  @ApiOperation({ summary: 'Track link click and redirect to original URL' })
  async trackClick(
    @Query('campaignId') campaignId: string,
    @Query('recipientId') recipientId: string,
    @Query('url') originalUrl: string,
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    try {
      if (Types.ObjectId.isValid(campaignId) && Types.ObjectId.isValid(recipientId) && originalUrl) {
        const recipient = await this.recipientModel.findById(recipientId).exec();
        if (recipient) {
          const ipAddress = req.ip || req.socket.remoteAddress;
          const userAgent = req.headers['user-agent'] || '';
          const { browser, device } = this.parseUserAgent(userAgent);

          // Log Click Event
          await this.eventModel.create({
            organizationId: recipient.organizationId,
            campaignId: recipient.campaignId,
            recipientId: recipient._id,
            contactId: recipient.contactId,
            eventType: 'click',
            url: originalUrl,
            ipAddress,
            userAgent,
            browser,
            device,
          });

          // Update recipient status to clicked
          const now = new Date();
          recipient.status = 'clicked';
          recipient.clickedAt = now;
          if (!recipient.openedAt) {
            recipient.openedAt = now; // Clicking implicitly opens the email
          }
          await recipient.save();
        }
      }
    } catch (err) {
      console.error('Failed to log email click event:', err);
    }

    // Perform redirect to original URL
    const redirectUrl = originalUrl || '/';
    return res.redirect(redirectUrl);
  }

  @Get('unsubscribe')
  @Public()
  @ApiOperation({ summary: 'Unsubscribe recipient from campaign' })
  async unsubscribe(
    @Query('campaignId') campaignId: string,
    @Query('recipientId') recipientId: string,
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    try {
      if (Types.ObjectId.isValid(campaignId) && Types.ObjectId.isValid(recipientId)) {
        const recipient = await this.recipientModel.findById(recipientId).exec();
        if (recipient && recipient.status !== 'unsubscribed') {
          const ipAddress = req.ip || req.socket.remoteAddress;
          const userAgent = req.headers['user-agent'] || '';
          const { browser, device } = this.parseUserAgent(userAgent);

          // Log Unsubscribe Event
          await this.eventModel.create({
            organizationId: recipient.organizationId,
            campaignId: recipient.campaignId,
            recipientId: recipient._id,
            contactId: recipient.contactId,
            eventType: 'unsubscribe',
            ipAddress,
            userAgent,
            browser,
            device,
          });

          // Update status
          recipient.status = 'unsubscribed';
          await recipient.save();

          // Add to suppression list
          await this.suppressionService.add(recipient.organizationId.toString(), {
            email: recipient.email,
            reason: SuppressionReason.UNSUBSCRIBE,
          });
        }
      }
    } catch (err) {
      console.error('Failed to log email unsubscribe event:', err);
    }

    // Return a nice styled HTML page confirming the unsubscribe
    res.set('Content-Type', 'text/html');
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Unsubscribed</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #f4f4f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .card { background-color: #18181b; border: 1px solid #27272a; padding: 2.5rem; border-radius: 1rem; text-align: center; max-width: 400px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5); }
            h1 { color: #10b981; margin-top: 0; font-size: 1.5rem; }
            p { color: #a1a1aa; font-size: 0.95rem; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Successfully Unsubscribed</h1>
            <p>You have been successfully unsubscribed from this campaign's mailing list. You will no longer receive emails regarding this campaign.</p>
          </div>
        </body>
      </html>
    `);
  }

  @Get('reply')
  @Public()
  @ApiOperation({ summary: 'Simulate user reply event' })
  async simulateReply(
    @Query('campaignId') campaignId: string,
    @Query('recipientId') recipientId: string,
    @Req() req: express.Request,
  ) {
    try {
      if (Types.ObjectId.isValid(campaignId) && Types.ObjectId.isValid(recipientId)) {
        const recipient = await this.recipientModel.findById(recipientId).exec();
        if (recipient && recipient.status !== 'replied') {
          const ipAddress = req.ip || req.socket.remoteAddress;
          const userAgent = req.headers['user-agent'] || '';
          const { browser, device } = this.parseUserAgent(userAgent);

          // Log Reply Event
          await this.eventModel.create({
            organizationId: recipient.organizationId,
            campaignId: recipient.campaignId,
            recipientId: recipient._id,
            contactId: recipient.contactId,
            eventType: 'reply',
            ipAddress,
            userAgent,
            browser,
            device,
          });

          // Update status
          recipient.status = 'replied';
          await recipient.save();
          return { success: true, message: 'Simulated reply event tracked.' };
        }
      }
    } catch (err) {
      console.error('Failed to log email reply event:', err);
    }
    return { success: false, message: 'Invalid recipient or campaign.' };
  }

  private parseUserAgent(uaString: string): { browser: string; device: string } {
    if (!uaString) return { browser: 'Unknown', device: 'Desktop' };
    const ua = uaString.toLowerCase();
    
    let device = 'Desktop';
    if (ua.includes('mobi') || ua.includes('iphone') || ua.includes('android')) {
      device = 'Mobile';
    } else if (ua.includes('ipad') || ua.includes('tablet')) {
      device = 'Tablet';
    }

    let browser = 'Other';
    if (ua.includes('chrome') || ua.includes('crios')) {
      browser = 'Chrome';
    } else if (ua.includes('safari') && !ua.includes('chrome')) {
      browser = 'Safari';
    } else if (ua.includes('firefox') || ua.includes('fxios')) {
      browser = 'Firefox';
    } else if (ua.includes('edge') || ua.includes('edg')) {
      browser = 'Edge';
    }

    return { browser, device };
  }
}
