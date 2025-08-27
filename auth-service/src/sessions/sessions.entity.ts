
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('sessionss')
@Index(['sessions_idx'], ['createdAt', 'status'])
export class Sessions {
    @PrimaryGeneratedColumn('uuid')
    id: string;
    
    @Column()
    @Index()
    name: string;
    
    @Column({ type: 'text', nullable: true })
    description: string;
    
    @Column({ 
        type: 'enum', 
        enum: ['active', 'inactive', 'pending'],
        default: 'active' 
    })
    status: string;
    
    @Column({ type: 'jsonb', default: {} })
    metadata: Record<string, any>;
    
    @CreateDateColumn()
    createdAt: Date;
    
    @UpdateDateColumn()
    updatedAt: Date;
}
