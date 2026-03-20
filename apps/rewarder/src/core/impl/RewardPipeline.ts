class RewardPipeline<TReward> implements IRewardPipeline<TReward> {
    public constructor(
        private readonly treeFactory: IRewardTreeFactory<TReward>,
        private readonly resolver: IRewardResolver<TReward>,
        private interceptors: readonly IRewardInterceptor<TReward>[] = [],
    ) {}

    public setInterceptors(interceptors: IRewardInterceptor<TReward>[]): void {
        this.interceptors = interceptors;
    }

    public async invoke(executionContext: RewardExecutionContext): Promise<RewardResult<TReward>> {
        const ctx = await this.createExecutionContext(executionContext);
        const next = this.createNextHandler(0);
        return await next(ctx);
    }

    private createNextHandler(interceptorIdx: number): RewardNextHandler<TReward> {
        return async (ctx) => {
            if (interceptorIdx < this.interceptors.length) {
                const interceptor = this.interceptors[interceptorIdx];
                const next = this.createNextHandler(interceptorIdx + 1);
                return await interceptor.intercept(ctx, next);
            }
            else {
                return this.resolver.resolve(ctx.tree, ctx.exec);
            }
        };
    }

    private async createExecutionContext(executionContext: RewardExecutionContext): Promise<RewardPipelineContext<TReward>> {
        return {
            exec: executionContext,
            tree: await this.treeFactory.create(executionContext),
        };
    }
}