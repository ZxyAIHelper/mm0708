const app = getApp()

Page({
    data: {
        couplet: null,
        inputNames: [], // Characters to highlight
        bannerChars: [],
        upperChars: [],
        lowerChars: []
    },

    onLoad() {
        if (app.globalData.generatedCouplet) {
            const response = app.globalData.generatedCouplet;
            const names = app.globalData.inputNames || [];

            const couplet = {
                banner: response.top || response.banner || '福随瑞至',
                upper: response.right || response.upper || '上联',
                lower: response.left || response.lower || '下联',
                meaning: response.explanation || response.meaning || ''
            };

            // Split text into character arrays with highlight flag
            this.setData({
                couplet,
                inputNames: names,
                bannerChars: this.splitWithHighlight(couplet.banner, names),
                upperChars: this.splitWithHighlight(couplet.upper, names),
                lowerChars: this.splitWithHighlight(couplet.lower, names)
            });
        } else {
            wx.showToast({
                title: '未找到对联数据',
                icon: 'none'
            });
            setTimeout(() => {
                wx.navigateBack();
            }, 1500);
        }
    },

    // Split text and mark characters to highlight
    splitWithHighlight(text, names) {
        return text.split('').map(char => ({
            char,
            highlight: names.includes(char)
        }));
    },

    saveImage() {
        wx.showToast({
            title: '保存功能开发中',
            icon: 'none'
        });
    },

    shareCouplet() {
        wx.showShareMenu({
            withShareTicket: true,
            menus: ['shareAppMessage', 'shareTimeline']
        });
        wx.showToast({
            title: '请点击右上角分享',
            icon: 'none'
        });
    },

    regenerate() {
        wx.navigateBack();
    },

    onShareAppMessage() {
        return {
            title: '我生成了一副春联，快来看看！',
            path: '/pages/index/index'
        };
    },

    onShareTimeline() {
        return {
            title: '春联生成器 - AI创作传统春联'
        };
    }
})
