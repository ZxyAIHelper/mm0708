class KNNClassifier {
    constructor(k = 3) {
        this.k = k;
        this.trainingData = [];
        this.isLoaded = false;
    }

    /**
     * 加载训练数据 (异步)
     * @param {string} url - JSON 文件的路径
     */
    async load(url) {
        try {
            const response = await fetch(url);
            const jsonData = await response.json();

            // 预处理：将 JSON 中的 landmarks 数据展平为向量，提高后续计算效率
            this.trainingData = jsonData.map(sample => ({
                label: sample.label,
                vector: this.flattenLandmarks(sample.data)
            }));

            this.isLoaded = true;
            console.log(`[KNN] 模型已加载，包含 ${this.trainingData.length} 个样本`);
        } catch (error) {
            console.error("[KNN] 加载模型数据失败:", error);
        }
    }

    /**
     * 将 3D 关键点数组转换为一维数组 [x1, y1, z1, x2, y2, z2, ...]
     */
    flattenLandmarks(landmarks) {
        const vector = [];
        // MediaPipe Pose 通常有 33 个点
        for (let i = 0; i < landmarks.length; i++) {
            vector.push(landmarks[i].x, landmarks[i].y, landmarks[i].z);
        }
        return vector;
    }

    /**
     * 计算两个向量的欧几里得距离
     */
    euclideanDistance(vecA, vecB) {
        let sum = 0;
        const length = Math.min(vecA.length, vecB.length);
        for (let i = 0; i < length; i++) {
            sum += (vecA[i] - vecB[i]) ** 2;
        }
        return Math.sqrt(sum);
    }

    /**
     * 对输入姿态进行分类
     * @param {Array} poseLandmarks - MediaPipe 输出的姿态关键点
     * @returns {string|null} - 预测的标签 (例如 'heart', 'star')，如果未就绪则返回 null
     */
    classify(poseLandmarks) {
        // 1. 安全检查：如果模型未加载或输入为空，直接返回 null
        if (!this.isLoaded || !poseLandmarks || poseLandmarks.length === 0) {
            return null;
        }

        const inputVector = this.flattenLandmarks(poseLandmarks);

        // 2. 计算与所有训练样本的距离
        // 这里使用 map 缓存距离，避免多次计算
        const distances = [];
        for (let i = 0; i < this.trainingData.length; i++) {
            const sample = this.trainingData[i];
            const dist = this.euclideanDistance(inputVector, sample.vector);
            distances.push({ label: sample.label, distance: dist });
        }

        // 3. 排序并取出最近的 K 个邻居
        distances.sort((a, b) => a.distance - b.distance);
        const kNearest = distances.slice(0, this.k);

        // 4. 投票 (多数表决)
        const counts = {};
        let maxLabel = null;
        let maxCount = -1;

        for (const neighbor of kNearest) {
            const label = neighbor.label;
            counts[label] = (counts[label] || 0) + 1;

            if (counts[label] > maxCount) {
                maxCount = counts[label];
                maxLabel = label;
            }
        }

        return maxLabel;
    }
}

// 导出单例实例，以便外部直接使用 knn.load() 和 knn.classify()
export const knn = new KNNClassifier(3);