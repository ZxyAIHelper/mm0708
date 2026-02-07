const app = getApp()

Page({
    data: {
        type: 'new_year', // new_year, relocation
        mode: 'couple', // couple, child
        name1: '',
        name2: '',
        childName: '',
        loading: false
    },

    onLoad(options) {
        if (options.type) {
            this.setData({ type: options.type })
        }
    },

    selectMode(e) {
        const mode = e.currentTarget.dataset.mode;
        this.setData({ mode });
    },

    onNameInput(e) {
        const field = e.currentTarget.dataset.field;
        this.setData({ [field]: e.detail.value });
    },

    onChildNameInput(e) {
        this.setData({ childName: e.detail.value });
    },

    async generateCouplet() {
        const { mode, name1, name2, childName, type } = this.data;
        let names = [];

        if (mode === 'couple') {
            if (!name1 || !name2) {
                wx.showToast({ title: '请输入两个名字', icon: 'none' });
                return;
            }
            names = [name1, name2];
        } else {
            if (!childName || childName.length < 2) {
                wx.showToast({ title: '请输入两个字的名字', icon: 'none' });
                return;
            }
            names = [childName];
        }

        this.setData({ loading: true });

        try {
            // Get user openid from globalData
            const userOpenid = app.globalData.userInfo?.openid;

            // Call Backend API
            const res = await new Promise((resolve, reject) => {
                wx.request({
                    url: 'https://api.mm0708.top/api/couplet/generate',
                    method: 'POST',
                    data: {
                        type,
                        mode,
                        names,
                        user_openid: userOpenid // 传递用户 openid 用于记录
                    },
                    success: resolve,
                    fail: reject
                })
            });

            if (res.statusCode === 200 && res.data && !res.data.error) {
                app.globalData.generatedCouplet = res.data;
                // Pass the input names for highlighting
                app.globalData.inputNames = names;
                wx.navigateTo({
                    url: '/pages/result/result',
                });
            } else {
                wx.showToast({ title: '生成失败，请重试', icon: 'none' });
                console.error('Generate failed', res);
            }
        } catch (err) {
            console.error(err);
            wx.showToast({ title: '网络错误', icon: 'none' });
        } finally {
            this.setData({ loading: false });
        }
    }
})
