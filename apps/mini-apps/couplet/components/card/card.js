Component({
    properties: {
        title: {
            type: String,
            value: ''
        },
        subtitle: {
            type: String,
            value: ''
        },
        type: {
            type: String,
            value: ''
        },
        active: {
            type: Boolean,
            value: false
        },
        icon: {
            type: String,
            value: '✨'
        },
        iconColor: {
            type: String,
            value: '#D32F2F'
        }
    },

    data: {
        iconBgColor: ''
    },

    lifetimes: {
        attached() {
            // Convert hex color to rgba with 0.1 alpha for background
            const hex = this.data.iconColor;
            const rgb = this.hexToRgb(hex);
            this.setData({
                iconBgColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`
            });
        }
    },

    methods: {
        onTap() {
            this.triggerEvent('select', {
                type: this.data.type
            })
        },

        hexToRgb(hex) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : { r: 211, g: 47, b: 47 };
        }
    }
})
