import { User } from './identity/user.entity';
import { UserSession } from './identity/user-session.entity';
import { UserVerification } from './identity/user-verification.entity';
import { UserInterest } from './identity/user-interest.entity';
import { CreatorProfile } from './identity/creator-profile.entity';
import { Category } from './catalog/category.entity';
import { Permission } from './catalog/permission.entity';
import { Integration } from './catalog/integration.entity';
import { Industry } from './catalog/industry.entity';
import { Agent } from './agents/agent.entity';
import { AgentVersion } from './agents/agent-version.entity';
import { AgentCategory } from './agents/agent-category.entity';
import { AgentPermission } from './agents/agent-permission.entity';
import { AgentIntegration } from './agents/agent-integration.entity';
import { AgentIndustry } from './agents/agent-industry.entity';
import { AgentRequirement } from './agents/agent-requirement.entity';
import { AgentDataPolicy } from './agents/agent-data-policy.entity';
import { AgentVerification } from './agents/agent-verification.entity';
import { Order } from './commerce/order.entity';
import { OrderItem } from './commerce/order-item.entity';
import { Payment } from './commerce/payment.entity';
import { Entitlement } from './commerce/entitlement.entity';
import { EntitlementEvent } from './commerce/entitlement-event.entity';
import { Refund } from './commerce/refund.entity';
import { RuntimeRegistration } from './runtime/runtime-registration.entity';
import { RuntimeCredential } from './runtime/runtime-credential.entity';
import { RuntimeRelease } from './runtime/runtime-release.entity';
import { RuntimeEvent } from './runtime/runtime-event.entity';
import { RuntimeConformanceRun } from './runtime/runtime-conformance-run.entity';
import { EvaluationPolicy } from './evaluation/evaluation-policy.entity';
import { EvaluationRun } from './evaluation/evaluation-run.entity';
import { EvaluationControlResult } from './evaluation/evaluation-control-result.entity';
import { EvaluationEvidenceRecord } from './evaluation/evaluation-evidence-record.entity';
import { EvaluationClaimAssessment } from './evaluation/evaluation-claim-assessment.entity';
import { TechnicalReviewCase } from './technical-review/technical-review-case.entity';
import { TechnicalReviewAssignment } from './technical-review/technical-review-assignment.entity';
import { TechnicalReviewControlReview } from './technical-review/technical-review-control-review.entity';
import { TechnicalReviewFinding } from './technical-review/technical-review-finding.entity';
import { TechnicalReviewCreatorResponse } from './technical-review/technical-review-creator-response.entity';
import { TechnicalReviewDecision } from './technical-review/technical-review-decision.entity';
import { TechnicalReviewEvent } from './technical-review/technical-review-event.entity';
import { ReviewAccessGrant } from './technical-review/review-access-grant.entity';
import { ReleaseGateOperation } from './release-gate/release-gate-operation.entity';
import { ReleaseGateDecision } from './release-gate/release-gate-decision.entity';
import { Review } from './reviews/review.entity';
import { ReviewReply } from './reviews/review-reply.entity';
import { Report } from './trust/report.entity';
import { SecurityReview } from './trust/security-review.entity';
import { SecurityReviewItem } from './trust/security-review-item.entity';
import { Notification } from './platform/notification.entity';
import { AuditLog } from './platform/audit-log.entity';
import { AgentReviewSubmission } from './agents/agent-review-submission.entity';
import { AgentReviewFeedback } from './agents/agent-review-feedback.entity';
import { SupportRequest } from './support/support-request.entity';
import { SupportMessage } from './support/support-message.entity';
import { ContactMessage } from './support/contact-message.entity';
import { CreatorLead } from './crm/creator-lead.entity';
import { CreatorGrowthEvent } from './crm/creator-growth-event.entity';
import { CreatorCrmNote } from './crm/creator-crm-note.entity';
import { CreatorIdea } from './activation/creator-idea.entity';
import { CreatorOpportunity } from './ideas/creator-opportunity.entity';
import { CreatorAssistanceRequest } from './activation/creator-assistance-request.entity';
import { CreatorActivationReminder } from './activation/creator-activation-reminder.entity';
import { ReviewRequest } from './success/review-request.entity';
import { CaseStudy } from './success/case-study.entity';
import { CreatorReferral } from './success/creator-referral.entity';
import { CreatorReferralEvent } from './success/creator-referral-event.entity';
import { CreatorCrmAction } from './crm/creator-crm-action.entity';
import {
  CreatorCrmTag,
  CreatorCrmRecordTag,
} from './crm/creator-crm-tag.entity';
import { CreatorCrmSegment } from './crm/creator-crm-segment.entity';
import { CreatorCrmSavedView } from './crm/creator-crm-saved-view.entity';
import { CreatorAttribution } from './crm/creator-attribution.entity';
import { ReferralReward } from './scale/referral-reward.entity';
import { Ambassador } from './scale/ambassador.entity';
import { AmbassadorLevel } from './scale/ambassador-level.entity';
import { Partnership } from './scale/partnership.entity';
import { Affiliate } from './scale/affiliate.entity';
import { AffiliateCommission } from './scale/affiliate-commission.entity';
import { GrowthRiskFlag } from './scale/growth-risk-flag.entity';
import {
  CommunityMembership,
  CommunityPost,
  CommunityComment,
  CommunityReaction,
} from './scale/community.entity';
import {
  BlogCategory,
  BlogTag,
  BlogPost,
  BlogPostTag,
  BlogPostRelation,
  BlogPostAgent,
  BlogPostMarketCategory,
  BlogSlugRedirect,
  BlogPostRevision,
  BlogPostRating,
  BlogComment,
  BlogCommentLike,
  BlogCommentReport,
  BlogCommentBan,
} from './blog';
import { ContentSeo, ContentLink, LinkSuggestion } from './seo';
export const ENTITIES = [
  ContentSeo,
  ContentLink,
  LinkSuggestion,
  User,
  UserInterest,
  UserSession,
  UserVerification,
  CreatorProfile,
  Category,
  Industry,
  AgentIndustry,
  Agent,
  AgentVersion,
  AgentCategory,
  Permission,
  AgentPermission,
  Integration,
  AgentIntegration,
  AgentRequirement,
  AgentDataPolicy,
  AgentVerification,
  AgentReviewSubmission,
  AgentReviewFeedback,
  Order,
  OrderItem,
  Payment,
  Entitlement,
  EntitlementEvent,
  RuntimeRegistration,
  RuntimeCredential,
  RuntimeRelease,
  RuntimeEvent,
  RuntimeConformanceRun,
  EvaluationPolicy,
  EvaluationRun,
  EvaluationControlResult,
  EvaluationEvidenceRecord,
  EvaluationClaimAssessment,
  TechnicalReviewCase,
  TechnicalReviewAssignment,
  TechnicalReviewControlReview,
  TechnicalReviewFinding,
  TechnicalReviewCreatorResponse,
  TechnicalReviewDecision,
  TechnicalReviewEvent,
  ReviewAccessGrant,
  ReleaseGateOperation,
  ReleaseGateDecision,
  Refund,
  Review,
  ReviewReply,
  Report,
  SecurityReview,
  SecurityReviewItem,
  Notification,
  AuditLog,
  SupportRequest,
  SupportMessage,
  ContactMessage,
  CreatorLead,
  CreatorGrowthEvent,
  CreatorCrmNote,
  CreatorIdea,
  CreatorOpportunity,
  CreatorAssistanceRequest,
  CreatorActivationReminder,
  ReviewRequest,
  CaseStudy,
  CreatorReferral,
  CreatorReferralEvent,
  CreatorCrmAction,
  CreatorCrmTag,
  CreatorCrmRecordTag,
  CreatorCrmSegment,
  CreatorCrmSavedView,
  CreatorAttribution,
  // ---- Phase C5: SCALE ----
  ReferralReward,
  Ambassador,
  AmbassadorLevel,
  Partnership,
  Affiliate,
  AffiliateCommission,
  GrowthRiskFlag,
  CommunityMembership,
  CommunityPost,
  CommunityComment,
  CommunityReaction,
  // Blog platform
  BlogCategory,
  BlogTag,
  BlogPost,
  BlogPostTag,
  BlogPostRelation,
  BlogPostAgent,
  BlogPostMarketCategory,
  BlogSlugRedirect,
  BlogPostRevision,
  BlogPostRating,
  BlogComment,
  BlogCommentLike,
  BlogCommentReport,
  BlogCommentBan,
];
export * from './scale/referral-reward.entity';
export * from './scale/ambassador.entity';
export * from './scale/ambassador-level.entity';
export * from './scale/partnership.entity';
export * from './scale/affiliate.entity';
export * from './scale/affiliate-commission.entity';
export * from './scale/growth-risk-flag.entity';
export * from './scale/community.entity';
export * from './ideas/creator-opportunity.entity';
export * from './blog';
export * from './seo';

export * from './technical-review/review-access-grant.entity';
export * from './technical-review/technical-review-case.entity';
export * from './technical-review/technical-review-assignment.entity';
export * from './technical-review/technical-review-control-review.entity';
export * from './technical-review/technical-review-finding.entity';
export * from './technical-review/technical-review-creator-response.entity';
export * from './technical-review/technical-review-decision.entity';
export * from './technical-review/technical-review-event.entity';

export * from './release-gate/release-gate-operation.entity';
export * from './release-gate/release-gate-decision.entity';
