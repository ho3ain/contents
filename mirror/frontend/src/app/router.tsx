import { Suspense } from 'react';
import { lazyRoute as lazy } from './lazyRoute';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PageLoader } from '../components/ui';
import { PublicShell } from '../pages/shell/PublicShell';
import { AuthShell } from '../pages/auth/AuthShell';
import { DashboardContainer } from '../pages/shell/DashboardContainer';
import { RequireAuth, RequireRole, GuestOnly } from '../pages/shell/Guards';
import { WebsiteLayout } from '../pages/website/WebsiteLayout';
import { ScrollToTop } from './ScrollToTop';

/* Route-level code splitting: every page below is fetched on demand so the
   first paint only ships the shell + the visitor-facing landing page. */
const CategoriesPage = lazy(() => import('../pages/public/CategoriesPage').then((module) => ({ default: module.CategoriesPage })));
const AgentDetailPage = lazy(() => import('../pages/public/AgentDetailPage').then((module) => ({ default: module.AgentDetailPage })));
const ProductComparisonPage = lazy(() =>
  import('../pages/public/ProductComparisonPage').then((module) => ({ default: module.ProductComparisonPage })),
);
const CreatorProfilePage = lazy(() =>
  import('../pages/public/CreatorProfilePage').then((module) => ({ default: module.CreatorProfilePage })),
);
const RefExplorePage = lazy(() => import('../pages/reference/RefExplorePage').then((module) => ({ default: module.RefExplorePage })));
const WebsiteHomePage = lazy(() => import('../pages/website/WebsiteHomePage').then((module) => ({ default: module.WebsiteHomePage })));
const WebsiteAboutPage = lazy(() => import('../pages/website/WebsiteAboutPage').then((module) => ({ default: module.WebsiteAboutPage })));
const WebsiteDevelopersPage = lazy(() =>
  import('../pages/website/WebsiteDevelopersPage').then((module) => ({ default: module.WebsiteDevelopersPage })),
);
const WebsiteContactPage = lazy(() =>
  import('../pages/website/WebsiteContactPage').then((module) => ({ default: module.WebsiteContactPage })),
);
// Sprint 1 — documentation center + legal documents (static content layer, see src/content).
const DocsPage = lazy(() => import('../pages/website/docs/DocsPage').then((module) => ({ default: module.DocsPage })));
const LegalIndexPage = lazy(() =>
  import('../pages/website/docs/LegalDocumentPage').then((module) => ({ default: module.LegalIndexPage })),
);
const LegalDocumentPage = lazy(() =>
  import('../pages/website/docs/LegalDocumentPage').then((module) => ({ default: module.LegalDocumentPage })),
);
// Blog platform — public reading routes (API-driven, see pages/blog).
const BlogHomePage = lazy(() => import('../pages/blog/BlogHomePage').then((module) => ({ default: module.BlogHomePage })));
const BlogArticlePage = lazy(() => import('../pages/blog/BlogArticlePage').then((module) => ({ default: module.BlogArticlePage })));
const BlogArchivePage = lazy(() => import('../pages/blog/BlogArchivePage').then((module) => ({ default: module.BlogArchivePage })));
// Blog platform — editorial CMS.
const AdminBlogPage = lazy(() => import('../pages/admin/blog/AdminBlogPage').then((module) => ({ default: module.AdminBlogPage })));
const AdminBlogEditorPage = lazy(() =>
  import('../pages/admin/blog/AdminBlogEditorPage').then((module) => ({ default: module.AdminBlogEditorPage })),
);
const AdminBlogPreviewPage = lazy(() =>
  import('../pages/admin/blog/AdminBlogPreviewPage').then((module) => ({ default: module.AdminBlogPreviewPage })),
);
const AdminBlogTaxonomyPage = lazy(() =>
  import('../pages/admin/blog/AdminBlogTaxonomyPage').then((module) => ({ default: module.AdminBlogTaxonomyPage })),
);
const AdminBlogCommentsPage = lazy(() =>
  import('../pages/admin/blog/AdminBlogCommentsPage').then((module) => ({ default: module.AdminBlogCommentsPage })),
);
const AdminKnowledgeGraphPage = lazy(() =>
  import('../pages/admin/blog/graph/AdminKnowledgeGraphPage').then((module) => ({ default: module.AdminKnowledgeGraphPage })),
);
const RoleHome = lazy(() => import('../pages/buyer/RoleHome').then((module) => ({ default: module.RoleHome })));
const LoginPage = lazy(() => import('../pages/auth/LoginPage').then((module) => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import('../pages/auth/RegisterPage').then((module) => ({ default: module.RegisterPage })));
const VerifyEmailPage = lazy(() => import('../pages/auth/VerifyEmailPage').then((module) => ({ default: module.VerifyEmailPage })));
const WelcomePage = lazy(() => import('../pages/auth/WelcomePage').then((module) => ({ default: module.WelcomePage })));
const OnboardingPage = lazy(() => import('../pages/auth/OnboardingPage').then((module) => ({ default: module.OnboardingPage })));
const ForgotPasswordPage = lazy(() =>
  import('../pages/auth/ForgotPasswordPage').then((module) => ({ default: module.ForgotPasswordPage })),
);
const AccountArea = lazy(() => import('../pages/shell/AccountArea').then((module) => ({ default: module.AccountArea })));
const LibraryPage = lazy(() => import('../pages/buyer/LibraryPage').then((module) => ({ default: module.LibraryPage })));
const MyProductsPage = lazy(() => import('../pages/buyer/MyProductsPage').then((module) => ({ default: module.MyProductsPage })));
const AccessCenterPage = lazy(() => import('../pages/buyer/AccessCenterPage').then((module) => ({ default: module.AccessCenterPage })));
const ProductWorkspacePage = lazy(() =>
  import('../pages/buyer/workspace/ProductWorkspacePage').then((module) => ({ default: module.ProductWorkspacePage })),
);
const AdminBuyerJourneyPage = lazy(() =>
  import('../pages/admin/AdminBuyerJourneyPage').then((module) => ({ default: module.AdminBuyerJourneyPage })),
);
const FavoritesPage = lazy(() => import('../pages/buyer/FavoritesPage').then((module) => ({ default: module.FavoritesPage })));
const FollowsPage = lazy(() => import('../pages/buyer/FollowsPage').then((module) => ({ default: module.FollowsPage })));
const InterestsPage = lazy(() => import('../pages/buyer/InterestsPage').then((module) => ({ default: module.InterestsPage })));
const AdminDiscoveryPage = lazy(() =>
  import('../pages/admin/AdminDiscoveryPage').then((module) => ({ default: module.AdminDiscoveryPage })),
);
const OrdersPage = lazy(() => import('../pages/buyer/OrdersPage').then((module) => ({ default: module.OrdersPage })));
const OrderDetailPage = lazy(() => import('../pages/buyer/OrderDetailPage').then((module) => ({ default: module.OrderDetailPage })));
const MyReviewsPage = lazy(() => import('../pages/buyer/MyReviewsPage').then((module) => ({ default: module.MyReviewsPage })));
const NotificationsPage = lazy(() => import('../pages/buyer/NotificationsPage').then((module) => ({ default: module.NotificationsPage })));
const SettingsPage = lazy(() => import('../pages/buyer/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const CreatorArea = lazy(() => import('../pages/creator/CreatorArea').then((module) => ({ default: module.CreatorArea })));
const CreatorDashboardPage = lazy(() =>
  import('../pages/creator/CreatorDashboardPage').then((module) => ({ default: module.CreatorDashboardPage })),
);
const MyAgentsPage = lazy(() => import('../pages/creator/MyAgentsPage').then((module) => ({ default: module.MyAgentsPage })));
const RuntimeCenterPage = lazy(() =>
  import('../pages/creator/RuntimeCenterPage').then((module) => ({ default: module.RuntimeCenterPage })),
);
const EvaluationsPage = lazy(() =>
  import('../pages/creator/EvaluationsPage').then((module) => ({ default: module.EvaluationsPage })),
);
const TechnicalReviewsPage = lazy(() =>
  import('../pages/creator/TechnicalReviewsPage').then((module) => ({ default: module.TechnicalReviewsPage })),
);
const CreatorMonitoringPage = lazy(() =>
  import('../pages/creator/CreatorMonitoringPage').then((module) => ({ default: module.CreatorMonitoringPage })),
);
const CreatorSalesPage = lazy(() => import('../pages/creator/CreatorSalesPage').then((module) => ({ default: module.CreatorSalesPage })));
const CreatorFinancePage = lazy(() =>
  import('../pages/creator/finance/CreatorFinancePage').then((module) => ({ default: module.CreatorFinancePage })),
);
const AgentPreviewPage = lazy(() => import('../pages/creator/AgentPreviewPage').then((module) => ({ default: module.AgentPreviewPage })));
const AgentSubmittedPage = lazy(() =>
  import('../pages/creator/AgentSubmittedPage').then((module) => ({ default: module.AgentSubmittedPage })),
);
const AgentWizardPage = lazy(() => import('../pages/creator/AgentWizardPage').then((module) => ({ default: module.AgentWizardPage })));
const AgentDetailCreatorPage = lazy(() =>
  import('../pages/creator/AgentDetailCreatorPage').then((module) => ({ default: module.AgentDetailCreatorPage })),
);
const CreatorReviewsPage = lazy(() =>
  import('../pages/creator/CreatorReviewsPage').then((module) => ({ default: module.CreatorReviewsPage })),
);
const ReviewCenterListPage = lazy(() =>
  import('../pages/creator/ReviewCenterListPage').then((module) => ({ default: module.ReviewCenterListPage })),
);
const ReviewCenterPage = lazy(() => import('../pages/creator/ReviewCenterPage').then((module) => ({ default: module.ReviewCenterPage })));
const CreatorProfileEditPage = lazy(() =>
  import('../pages/creator/CreatorProfileEditPage').then((module) => ({ default: module.CreatorProfileEditPage })),
);
const CreatorOnboardingPage = lazy(() =>
  import('../pages/creator/CreatorOnboardingPage').then((module) => ({ default: module.CreatorOnboardingPage })),
);
const CreatorSuccessPage = lazy(() =>
  import('../pages/creator/CreatorSuccessPage').then((module) => ({ default: module.CreatorSuccessPage })),
);
const ReviewInsightPage = lazy(() =>
  import('../pages/creator/ReviewInsightPage').then((module) => ({ default: module.ReviewInsightPage })),
);
const CaseStudyWizardPage = lazy(() =>
  import('../pages/creator/CaseStudyWizardPage').then((module) => ({ default: module.CaseStudyWizardPage })),
);
const ReferralCenterPage = lazy(() =>
  import('../pages/creator/ReferralCenterPage').then((module) => ({ default: module.ReferralCenterPage })),
);
const CreatorTimelinePage = lazy(() =>
  import('../pages/creator/CreatorTimelinePage').then((module) => ({ default: module.CreatorTimelinePage })),
);
const PublicCaseStudyPage = lazy(() =>
  import('../pages/public/PublicCaseStudyPage').then((module) => ({ default: module.PublicCaseStudyPage })),
);
const AdminSuccessPage = lazy(() =>
  import('../pages/admin/success/AdminSuccessPage').then((module) => ({ default: module.AdminSuccessPage })),
);
const CreatorScalePage = lazy(() => import('../pages/creator/CreatorScalePage').then((module) => ({ default: module.CreatorScalePage })));
const AdminScaleDashboardPage = lazy(() =>
  import('../pages/admin/scale/AdminScaleDashboardPage').then((module) => ({ default: module.AdminScaleDashboardPage })),
);
const AdminScaleReportsPage = lazy(() =>
  import('../pages/admin/scale/AdminScaleReportsPage').then((module) => ({ default: module.AdminScaleReportsPage })),
);
const AdminScaleRewardsPage = lazy(() =>
  import('../pages/admin/scale/AdminScaleRewardsPage').then((module) => ({ default: module.AdminScaleRewardsPage })),
);
const AdminScaleAmbassadorsPage = lazy(() =>
  import('../pages/admin/scale/AdminScaleAmbassadorsPage').then((module) => ({ default: module.AdminScaleAmbassadorsPage })),
);
const AdminScalePartnershipsPage = lazy(() =>
  import('../pages/admin/scale/AdminScalePartnershipsPage').then((module) => ({ default: module.AdminScalePartnershipsPage })),
);
const AdminScaleAffiliatesPage = lazy(() =>
  import('../pages/admin/scale/AdminScaleAffiliatesPage').then((module) => ({ default: module.AdminScaleAffiliatesPage })),
);
const AdminScaleModerationPage = lazy(() =>
  import('../pages/admin/scale/AdminScaleModerationPage').then((module) => ({ default: module.AdminScaleModerationPage })),
);
const CreatorActivationPage = lazy(() =>
  import('../pages/creator/CreatorActivationPage').then((module) => ({ default: module.CreatorActivationPage })),
);
const AdminActivationPage = lazy(() =>
  import('../pages/admin/activation/AdminActivationPage').then((module) => ({ default: module.AdminActivationPage })),
);
const AdminRuntimePage = lazy(() =>
  import('../pages/admin/AdminRuntimePage').then((module) => ({ default: module.AdminRuntimePage })),
);
const AdminMonitoringPage = lazy(() =>
  import('../pages/admin/AdminMonitoringPage').then((module) => ({ default: module.AdminMonitoringPage })),
);
const AdminCreatorOpportunitiesPage = lazy(() =>
  import('../pages/admin/AdminCreatorOpportunitiesPage').then((module) => ({ default: module.AdminCreatorOpportunitiesPage })),
);
const PublishFlowPage = lazy(() => import('../pages/creator/PublishFlowPage').then((module) => ({ default: module.PublishFlowPage })));
const LaunchPage = lazy(() => import('../pages/creator/LaunchPage').then((module) => ({ default: module.LaunchPage })));
const CreatorSaleDetailPage = lazy(() =>
  import('../pages/creator/CreatorSaleDetailPage').then((module) => ({ default: module.CreatorSaleDetailPage })),
);
const AdminPromotionsPage = lazy(() =>
  import('../pages/admin/AdminPromotionsPage').then((module) => ({ default: module.AdminPromotionsPage })),
);
const AdminGrowthPage = lazy(() => import('../pages/admin/AdminGrowthPage').then((module) => ({ default: module.AdminGrowthPage })));
const AdminCrmPage = lazy(() => import('../pages/admin/AdminCrmPage').then((module) => ({ default: module.AdminCrmPage })));
const AdminCrmLeadPage = lazy(() => import('../pages/admin/AdminCrmLeadPage').then((module) => ({ default: module.AdminCrmLeadPage })));
const GrowthCenterPage = lazy(() => import('../pages/creator/GrowthCenterPage').then((module) => ({ default: module.GrowthCenterPage })));
const IdeasPage = lazy(() => import('../pages/creator/IdeasPage').then((module) => ({ default: module.IdeasPage })));
const ProductInsightsPage = lazy(() =>
  import('../pages/creator/ProductInsightsPage').then((module) => ({ default: module.ProductInsightsPage })),
);
const PortfolioPage = lazy(() => import('../pages/creator/PortfolioPage').then((module) => ({ default: module.PortfolioPage })));
const CreatorAnalyticsPage = lazy(() =>
  import('../pages/creator/CreatorAnalyticsPage').then((module) => ({ default: module.CreatorAnalyticsPage })),
);
const CreatorAccessPage = lazy(() => import('../pages/creator/CreatorAccessPage').then((module) => ({ default: module.CreatorAccessPage })));
const AdminArea = lazy(() => import('../pages/admin/AdminArea').then((module) => ({ default: module.AdminArea })));
const AdminOverviewPage = lazy(() => import('../pages/admin/AdminOverviewPage').then((module) => ({ default: module.AdminOverviewPage })));
const AdminAgentsPage = lazy(() => import('../pages/admin/AdminAgentsPage').then((module) => ({ default: module.AdminAgentsPage })));
const AdminProductInsightsPage = lazy(() =>
  import('../pages/admin/AdminProductInsightsPage').then((module) => ({ default: module.AdminProductInsightsPage })),
);
const AdminTaxonomyPage = lazy(() => import('../pages/admin/AdminTaxonomyPage').then((module) => ({ default: module.AdminTaxonomyPage })));
const AdminReviewQueuePage = lazy(() =>
  import('../pages/admin/AdminReviewQueuePage').then((module) => ({ default: module.AdminReviewQueuePage })),
);
const AdminReviewWorkspacePage = lazy(() =>
  import('../pages/admin/AdminReviewWorkspacePage').then((module) => ({ default: module.AdminReviewWorkspacePage })),
);
const AdminTechnicalReviewPage = lazy(() =>
  import('../pages/admin/AdminTechnicalReviewPage').then((module) => ({ default: module.AdminTechnicalReviewPage })),
);
const AdminCreatorsPage = lazy(() => import('../pages/admin/AdminCreatorsPage').then((module) => ({ default: module.AdminCreatorsPage })));
const AdminUsersPage = lazy(() => import('../pages/admin/AdminUsersPage').then((module) => ({ default: module.AdminUsersPage })));
const AdminReportsPage = lazy(() => import('../pages/admin/AdminReportsPage').then((module) => ({ default: module.AdminReportsPage })));
const AdminCommercePage = lazy(() => import('../pages/admin/AdminCommercePage').then((module) => ({ default: module.AdminCommercePage })));
const AdminAuditPage = lazy(() => import('../pages/admin/AdminAuditPage').then((module) => ({ default: module.AdminAuditPage })));
const AdminControlCenterPage = lazy(() =>
  import('../pages/admin/control/AdminControlCenterPage').then((module) => ({ default: module.AdminControlCenterPage })),
);
const AdminAnalyticsPage = lazy(() =>
  import('../pages/admin/control/AdminAnalyticsPage').then((module) => ({ default: module.AdminAnalyticsPage })),
);
const AdminPayoutOpsPage = lazy(() =>
  import('../pages/admin/control/AdminPayoutOpsPage').then((module) => ({ default: module.AdminPayoutOpsPage })),
);
const AdminKycPage = lazy(() => import('../pages/admin/finance/AdminKycPage').then((module) => ({ default: module.AdminKycPage })));
const AdminUsageMeteringPage = lazy(() =>
  import('../pages/admin/finance/AdminUsageMeteringPage').then((module) => ({ default: module.AdminUsageMeteringPage })),
);
const AdminKycDetailPage = lazy(() =>
  import('../pages/admin/finance/AdminKycDetailPage').then((module) => ({ default: module.AdminKycDetailPage })),
);
const AdminPayoutOpsDetailPage = lazy(() =>
  import('../pages/admin/control/AdminPayoutOpsDetailPage').then((module) => ({ default: module.AdminPayoutOpsDetailPage })),
);
const AdminModerationPage = lazy(() =>
  import('../pages/admin/control/AdminModerationPage').then((module) => ({ default: module.AdminModerationPage })),
);
const AdminModerationCasePage = lazy(() =>
  import('../pages/admin/control/AdminModerationPage').then((module) => ({ default: module.AdminModerationCasePage })),
);
const AdminSupportOpsPage = lazy(() =>
  import('../pages/admin/control/AdminSupportOpsPage').then((module) => ({ default: module.AdminSupportOpsPage })),
);
const AdminSupportOpsDetailPage = lazy(() =>
  import('../pages/admin/control/AdminSupportOpsPage').then((module) => ({ default: module.AdminSupportOpsDetailPage })),
);
const AdminUser360Page = lazy(() =>
  import('../pages/admin/control/AdminUser360Page').then((module) => ({ default: module.AdminUser360Page })),
);
const AdminPlatformPage = lazy(() =>
  import('../pages/admin/control/AdminPlatformPage').then((module) => ({ default: module.AdminPlatformPage })),
);
const AdminRolesPage = lazy(() => import('../pages/admin/control/AdminRolesPage').then((m) => ({ default: m.AdminRolesPage })));
const AdminRiskPage = lazy(() => import('../pages/admin/control/AdminRiskPage').then((module) => ({ default: module.AdminRiskPage })));
const AdminRiskDetailPage = lazy(() =>
  import('../pages/admin/control/AdminRiskPage').then((module) => ({ default: module.AdminRiskDetailPage })),
);
const AdminAuditTrailPage = lazy(() =>
  import('../pages/admin/control/AdminAuditTrailPage').then((module) => ({ default: module.AdminAuditTrailPage })),
);
const AdminAuditArchivesPage = lazy(() =>
  import('../pages/admin/control/AdminAuditArchivesPage').then((module) => ({ default: module.AdminAuditArchivesPage })),
);
const AdminSearchPage = lazy(() =>
  import('../pages/admin/control/AdminSearchExportsPage').then((module) => ({ default: module.AdminSearchPage })),
);
const AdminExportsPage = lazy(() =>
  import('../pages/admin/control/AdminSearchExportsPage').then((module) => ({ default: module.AdminExportsPage })),
);
const SupportListPage = lazy(() => import('../pages/support/SupportListPage').then((module) => ({ default: module.SupportListPage })));
const SupportRequestDetailPage = lazy(() =>
  import('../pages/support/SupportRequestDetailPage').then((module) => ({ default: module.SupportRequestDetailPage })),
);
const CreateSupportRequestPage = lazy(() =>
  import('../pages/buyer/CreateSupportRequestPage').then((module) => ({ default: module.CreateSupportRequestPage })),
);
const PaymentCallbackPage = lazy(() =>
  import('../pages/buyer/PaymentCallbackPage').then((module) => ({ default: module.PaymentCallbackPage })),
);
const CheckoutReviewPage = lazy(() =>
  import('../pages/buyer/CheckoutReviewPage').then((module) => ({ default: module.CheckoutReviewPage })),
);
const SandboxGatewayPage = lazy(() =>
  import('../pages/buyer/SandboxGatewayPage').then((module) => ({ default: module.SandboxGatewayPage })),
);

const TaxonomyLandingPage = lazy(() =>
  import('../pages/public/TaxonomyLandingPage').then((module) => ({ default: module.TaxonomyLandingPage })),
);
const NotFound = lazy(() => import('../pages/shell/NotFound').then((module) => ({ default: module.NotFound })));

function withSuspense(element: React.ReactNode) {
  return <Suspense fallback={<PageLoader />}>{element}</Suspense>;
}

/** Application navigation graph (mirrors the Playbook's app/navigation layer). */
export function AppRoutes() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        {/*
          Public website — every page is a React component sharing one
          consistent source-faithful chrome (header/footer, see
          pages/website/WebsiteLayout). The marketplace browser and the
          backend-driven detail pages live under the same chrome. The .html
          aliases keep every original source link valid via redirects.
        */}
        <Route element={<WebsiteLayout />}>
          <Route index element={<WebsiteHomePage />} />
          <Route path="agents" element={<RefExplorePage />} />
          <Route path="agents/:slug" element={<AgentDetailPage />} />
          <Route path="compare" element={<ProductComparisonPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="categories/:slug" element={<TaxonomyLandingPage kind="category" />} />
          <Route path="industries" element={<Navigate to="/categories#industries" replace />} />
          <Route path="industries/:slug" element={<TaxonomyLandingPage kind="industry" />} />
          <Route path="creators/:slug" element={<CreatorProfilePage />} />
          <Route path="about" element={<WebsiteAboutPage />} />
          <Route path="developers" element={<WebsiteDevelopersPage />} />
          <Route path="contact" element={<WebsiteContactPage />} />
          {/* Sprint 1 — docs center + legal. Legal routes are stable public
              URLs referenced by the signup consent and the footer; the short
              aliases keep older links valid. */}
          <Route path="docs" element={withSuspense(<DocsPage />)} />
          <Route path="docs/:slug" element={withSuspense(<DocsPage />)} />
          <Route path="legal" element={withSuspense(<LegalIndexPage />)} />
          <Route path="legal/:doc" element={withSuspense(<LegalDocumentPage />)} />
          <Route path="terms" element={<Navigate to="/legal/terms" replace />} />
          <Route path="privacy" element={<Navigate to="/legal/privacy" replace />} />
          <Route path="refunds" element={<Navigate to="/legal/refunds" replace />} />
          {/* Blog platform — literal archive routes are declared before the
              article pattern so `/blog/category/x` is never read as a slug. */}
          <Route path="blog" element={<BlogHomePage />} />
          <Route path="blog/category/:slug" element={<BlogArchivePage kind="category" />} />
          <Route path="blog/tag/:slug" element={<BlogArchivePage kind="tag" />} />
          <Route path="blog/author/:slug" element={<BlogArchivePage kind="author" />} />
          <Route path="blog/:slug" element={<BlogArticlePage />} />
          <Route
            path="stories/:slug"
            element={
              <Suspense fallback={<PageLoader />}>
                <PublicCaseStudyPage />
              </Suspense>
            }
          />
          {/* Original static-source aliases — permanent redirects to the SPA routes. */}
          <Route path="index.html" element={<Navigate to="/" replace />} />
          <Route path="agents.html" element={<Navigate to="/agents" replace />} />
          <Route path="about.html" element={<Navigate to="/about" replace />} />
          <Route path="developers.html" element={<Navigate to="/developers" replace />} />
          <Route path="contact.html" element={<Navigate to="/contact" replace />} />
          <Route path="blog.html" element={<Navigate to="/blog" replace />} />
          <Route path="article.html" element={<Navigate to="/blog" replace />} />
        </Route>

        <Route element={<PublicShell />}>
          {/* Sprint 2 — order review between the product page and the gateway */}
          <Route
            path="checkout/:slug"
            element={
              <RequireAuth>
                <CheckoutReviewPage />
              </RequireAuth>
            }
          />
          {/* Payment gateway return — auth-only flow keeps its app shell */}
          <Route
            path="payment/callback"
            element={
              <RequireAuth>
                <PaymentCallbackPage />
              </RequireAuth>
            }
          />
          <Route
            path="payment/sandbox"
            element={
              <RequireAuth>
                <SandboxGatewayPage />
              </RequireAuth>
            }
          />
        </Route>

        {/* ────────────────────────────────────────────────────
            Auth pages — independent AuthShell (no public header/footer)
           ──────────────────────────────────────────────────── */}
        <Route element={<AuthShell />}>
          <Route
            path="login"
            element={
              <GuestOnly>
                <LoginPage />
              </GuestOnly>
            }
          />
          <Route
            path="register"
            element={
              <GuestOnly>
                <RegisterPage />
              </GuestOnly>
            }
          />
          <Route
            path="verify-email"
            element={
              <RequireAuth>
                <VerifyEmailPage />
              </RequireAuth>
            }
          />
          <Route
            path="welcome"
            element={
              <RequireAuth>
                <WelcomePage />
              </RequireAuth>
            }
          />
          <Route
            path="onboarding"
            element={
              <RequireAuth>
                <OnboardingPage />
              </RequireAuth>
            }
          />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
        </Route>

        {/* ────────────────────────────────────────────────────
            Dashboard pages — own header + sidebar, NO public header/footer
           ──────────────────────────────────────────────────── */}
        <Route element={<DashboardContainer />}>
          {/* Account-level pages. The shell follows the user's ACTIVE panel
              (PanelContext): a creator in the creator workspace opening
              /me/notifications keeps the creator sidebar — no chrome flip. */}
          <Route
            path="/"
            element={
              <RequireAuth>
                <AccountArea />
              </RequireAuth>
            }
          >
            <Route path="dashboard" element={<RoleHome />} />
            <Route path="library" element={<LibraryPage />} />
            <Route path="buyer" element={<Navigate to="/library" replace />} />
            <Route path="buyer/products" element={<MyProductsPage />} />
            <Route path="buyer/access" element={<AccessCenterPage />} />
            <Route path="buyer/products/:id/:tab?" element={<ProductWorkspacePage />} />
            <Route path="me/favorites" element={<FavoritesPage />} />
            <Route path="me/follows" element={<FollowsPage />} />
            {/* Recently viewed was retired (Personal Collections phase); old
                links land on the buyer home instead of a dead page. */}
            <Route path="me/recent" element={<Navigate to="/library" replace />} />
            <Route path="me/interests" element={<InterestsPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:id" element={<OrderDetailPage />} />
            <Route path="me/reviews" element={<MyReviewsPage />} />
            <Route path="me/notifications" element={<NotificationsPage />} />
            <Route path="me/notifications/reports" element={<NotificationsPage tab="reports" />} />
            {/* Report history moved under the notifications area (Buyer Account
                phase): the standalone page is gone from the primary nav, the
                records and APIs are untouched, and the old URL redirects — a
                plain `replace` to a different path, so no loop is possible. */}
            <Route path="me/reports" element={<Navigate to="/me/notifications/reports" replace />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="support" element={<SupportListPage />} />
            <Route path="support/new" element={<CreateSupportRequestPage />} />
            <Route path="support/:id" element={<SupportRequestDetailPage />} />
          </Route>

          {/* Creator onboarding (Phase A1): signed-in users of ANY role —
              a buyer creates their creator profile inside the wizard, so it
              cannot sit behind RequireRole("creator"). Server-side
              authorization stays per endpoint. */}
          <Route
            path="/creator/onboarding"
            element={
              <RequireAuth>
                <CreatorOnboardingPage />
              </RequireAuth>
            }
          />

          {/* Creator studio */}
          <Route
            path="/creator"
            element={
              <RequireRole role="creator">
                <CreatorArea />
              </RequireRole>
            }
          >
            <Route index element={<CreatorDashboardPage />} />
            <Route path="agents" element={<MyAgentsPage />} />
            <Route path="runtimes" element={<RuntimeCenterPage />} />
            <Route path="evaluations" element={<EvaluationsPage />} />
            <Route path="technical-reviews" element={<TechnicalReviewsPage />} />
            <Route path="monitoring" element={<CreatorMonitoringPage />} />
            <Route path="agents/new" element={<AgentWizardPage mode="create" />} />
            <Route path="agents/:id" element={<AgentDetailCreatorPage />} />
            <Route path="agents/:id/edit" element={<AgentWizardPage mode="edit" />} />
            <Route path="agents/:id/preview" element={<AgentPreviewPage />} />
            <Route path="agents/:id/submitted" element={<AgentSubmittedPage />} />
            <Route path="agents/:id/review" element={<ReviewCenterPage />} />
            <Route path="agents/:id/publish" element={<PublishFlowPage />} />
            <Route path="agents/:id/launch" element={<LaunchPage />} />
            <Route path="agents/:id/insights" element={<ProductInsightsPage />} />
            <Route path="growth" element={<GrowthCenterPage />} />
            {/* Phase C3 — the Activation Center. It sits next to the growth
                center rather than replacing it: growth is about a creator who
                already ships, activation is about the first product. */}
            <Route path="activation" element={<CreatorActivationPage />} />
            <Route path="success" element={<CreatorSuccessPage />} />
            <Route path="success/reviews" element={<ReviewInsightPage />} />
            {/* The case-study index. The wizard loads the caller's own story
                rather than reading the path, so the index, `new` and `:id`
                all resolve to the one record the database allows. */}
            <Route path="success/case-study" element={<CaseStudyWizardPage />} />
            <Route path="success/case-study/new" element={<CaseStudyWizardPage />} />
            <Route path="success/case-study/:id" element={<CaseStudyWizardPage />} />
            <Route path="success/referral" element={<ReferralCenterPage />} />
            <Route path="success/timeline" element={<CreatorTimelinePage />} />
            {/* Phase C5 — the creator Growth Centre. Nested routes, because
                §2 wants ONE connected engine, not five separate pages a
                creator has to find. */}
            <Route path="scale/*" element={<CreatorScalePage />} />
            <Route path="ideas" element={<IdeasPage />} />
            <Route path="portfolio" element={<PortfolioPage />} />
            <Route path="analytics" element={<CreatorAnalyticsPage />} />
            <Route path="access" element={<CreatorAccessPage />} />
            <Route path="review-center" element={<ReviewCenterListPage />} />
            <Route path="sales" element={<CreatorSalesPage />} />
            <Route path="finance" element={<CreatorFinancePage />} />
            <Route path="sales/:orderId" element={<CreatorSaleDetailPage />} />
            <Route path="reviews" element={<CreatorReviewsPage />} />
            <Route path="profile" element={<CreatorProfileEditPage />} />
            <Route path="support" element={<SupportListPage />} />
            {/* `support/new` is declared in EVERY panel that lists support
                requests. `SupportListPage` builds its "new request" link as
                `${base}/new`, and with the route registered only under the
                account area, a creator clicking it landed on the catch-all
                NotFound — a link the app itself rendered, going nowhere.
                Order matters: `new` must precede `:id` or it is swallowed as
                an id. */}
            <Route path="support/new" element={<CreateSupportRequestPage />} />
            <Route path="support/:id" element={<SupportRequestDetailPage />} />
          </Route>

          {/* Blog platform — authorised private preview, rendered inside the
              shared article styling without public header/footer, never indexed. */}
          <Route
            path="/admin/blog/posts/:id/preview"
            element={
              <RequireRole role="admin">
                <WebsiteLayout chrome={false}>
                  <AdminBlogPreviewPage />
                </WebsiteLayout>
              </RequireRole>
            }
          />

          {/* Admin console */}
          <Route
            path="/admin"
            element={
              <RequireRole role="admin">
                <AdminArea />
              </RequireRole>
            }
          >
            <Route index element={<AdminOverviewPage />} />
            <Route path="agents" element={<AdminAgentsPage />} />
            <Route path="success" element={<AdminSuccessPage />} />
            {/* Phase C5 — admin growth: dashboard, money, and the three
                review queues. */}
            <Route path="scale" element={<AdminScaleDashboardPage />} />
            <Route path="scale/rewards" element={<AdminScaleRewardsPage />} />
            <Route path="scale/reports" element={<AdminScaleReportsPage />} />
            <Route path="scale/ambassadors" element={<AdminScaleAmbassadorsPage />} />
            <Route path="scale/partnerships" element={<AdminScalePartnershipsPage />} />
            <Route path="scale/affiliates" element={<AdminScaleAffiliatesPage />} />
            <Route path="scale/community" element={<AdminScaleModerationPage />} />
            <Route path="scale/risk" element={<AdminScaleModerationPage />} />
            <Route path="agents/:id/insights" element={<AdminProductInsightsPage />} />
            <Route path="reviews" element={<AdminReviewQueuePage />} />
            <Route path="technical-reviews" element={<AdminTechnicalReviewPage />} />
            <Route path="reviews/:agentId" element={<AdminReviewWorkspacePage />} />
            <Route path="creators" element={<AdminCreatorsPage />} />
            <Route path="creator-opportunities" element={<AdminCreatorOpportunitiesPage />} />
            <Route path="crm" element={<AdminCrmPage />} />
            {/* Phase C3 — the Operations activation view: funnel, stalled
                creators and the assistance queue. */}
            <Route path="activation" element={<AdminActivationPage />} />
            <Route path="runtimes" element={<AdminRuntimePage />} />
            <Route path="monitoring" element={<AdminMonitoringPage />} />
            <Route path="crm/:leadId" element={<AdminCrmLeadPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="reports" element={<AdminReportsPage />} />
            <Route path="promotions" element={<AdminPromotionsPage />} />
            <Route path="growth" element={<AdminGrowthPage />} />
            <Route path="discovery" element={<AdminDiscoveryPage />} />
            {/* Taxonomy v2 — categories / subcategories / industries. */}
            <Route path="taxonomy" element={<AdminTaxonomyPage />} />
            {/* Blog platform — editorial CMS. `posts/new` precedes `posts/:id`. */}
            <Route path="blog" element={<AdminBlogPage />} />
            <Route path="blog/posts/new" element={<AdminBlogEditorPage />} />
            <Route path="blog/posts/:id" element={<AdminBlogEditorPage />} />
            <Route path="blog/taxonomy" element={<AdminBlogTaxonomyPage />} />
            <Route path="blog/comments" element={<AdminBlogCommentsPage />} />
            {/* SEO Studio — Knowledge Graph of articles, products, keywords and categories. */}
            <Route path="blog/graph" element={<AdminKnowledgeGraphPage />} />
            <Route path="buyer-journey" element={<AdminBuyerJourneyPage />} />
            <Route path="orders" element={<AdminCommercePage tab="orders" />} />
            <Route path="payments" element={<AdminCommercePage tab="payments" />} />
            <Route path="refunds" element={<AdminCommercePage tab="refunds" />} />
            <Route path="entitlements" element={<AdminCommercePage tab="entitlements" />} />
            <Route path="audit" element={<AdminAuditPage />} />
            {/* Phase 3 — the admin control plane. */}
            <Route path="control" element={<AdminControlCenterPage />} />
            <Route path="analytics" element={<AdminAnalyticsPage />} />
            <Route path="payout-ops" element={<AdminPayoutOpsPage />} />
            <Route path="payout-ops/:id" element={<AdminPayoutOpsDetailPage />} />
            <Route path="finance/usage" element={<AdminUsageMeteringPage />} />
            <Route path="finance/kyc" element={<AdminKycPage />} />
            <Route path="finance/kyc/:creatorId" element={<AdminKycDetailPage />} />
            <Route path="moderation" element={<AdminModerationPage />} />
            <Route path="moderation/:id" element={<AdminModerationCasePage />} />
            <Route path="support-ops" element={<AdminSupportOpsPage />} />
            <Route path="support-ops/:id" element={<AdminSupportOpsDetailPage />} />
            <Route path="users/:id/360" element={<AdminUser360Page />} />
            <Route path="platform" element={<AdminPlatformPage />} />
            <Route path="roles" element={<AdminRolesPage />} />
            <Route path="risk" element={<AdminRiskPage />} />
            <Route path="risk/:id" element={<AdminRiskDetailPage />} />
            <Route path="audit-trail" element={<AdminAuditTrailPage />} />
            <Route path="audit-archives" element={<AdminAuditArchivesPage />} />
            <Route path="search" element={<AdminSearchPage />} />
            <Route path="exports" element={<AdminExportsPage />} />
            <Route path="support" element={<SupportListPage />} />
            {/* Same reasoning as the creator branch: `SupportListPage` renders
                `${base}/new` for every panel, so the admin panel needs the
                route too. `new` before `:id` so it is not parsed as an id. */}
            <Route path="support/new" element={<CreateSupportRequestPage />} />
            <Route path="support/:id" element={<SupportRequestDetailPage />} />
          </Route>
        </Route>
        {/* end DashboardContainer */}

        {/* Catch-all — standalone, renders its own minimal layout */}
        <Route path="*" element={withSuspense(<NotFound />)} />
      </Routes>
    </BrowserRouter>
  );
}
