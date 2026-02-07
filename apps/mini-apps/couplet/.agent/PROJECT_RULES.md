# Spring Couplet Mini Program - Project Rules

## API Configuration

### Backend API Domain
**Production Domain**: `https://api.mm0708.top`

### API Endpoints
- Generate Couplet: `POST /api/couplet/generate`
- Get Prompts: `GET /api/couplet/prompts`
- Update Prompts: `POST /api/couplet/prompts`
- Prompt History: `GET /api/couplet/prompts/history`

### Usage
When making API requests in the Mini Program:
```javascript
const API_BASE = 'https://api.mm0708.top';

wx.request({
    url: `${API_BASE}/api/couplet/generate`,
    method: 'POST',
    // ...
})
```

---

## Development Guidelines

### File Structure
```
apps/mini-apps/couplet/
├── pages/          # Page components
├── components/     # Reusable components
├── styles/         # Global styles (theme.wxss)
└── app.json        # App configuration
```

### Design System
- Use `styles/theme.wxss` for all color/spacing variables
- System fonts: PingFang SC, Microsoft YaHei
- Border radius: 32rpx for cards/buttons
- Spacing: 8rpx baseline grid

### Component Usage
- `<card>`: Icon-based selection cards
- `<loading>`: Loading indicators
- Always register components in page's JSON file

---

## Deployment

### Admin Panel
Located at: `apps/pages/tools/couplet-admin/`
- Also uses `https://api.mm0708.top/api/couplet`

### WeChat Mini Program
Platform: WeChat DevTools
Account: (to be configured)

---

## Testing Requirements

### Code Generation (from core-engineering skill)
When generating new code:
- ✅ **Include**: Basic test cases or usage examples
- ❌ **Avoid**: Extensive test suites (keep it simple)

### Server-Side Code (from server-side-engineering skill)
For backend/API development:
- **Unit Tests**: Test individual functions and modules
- **Integration Tests**: Test API endpoints and database operations
- **CI/CD**: All tests must run on every PR

### Mini Program Testing
For WeChat Mini Program:
- Manual testing in WeChat DevTools
- Test on real devices before production
- Verify API integration with backend

### Test Checklist
- [ ] Happy path works correctly
- [ ] Error cases handled gracefully
- [ ] Edge cases considered
- [ ] Network errors handled (for API calls)

---

## Notes
- All API URLs must use `https://api.mm0708.top`
- Backend is deployed on Cloudflare Workers
- Database: D1 (Cloudflare)
