<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('print_job_attempts', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->char('tenant_id', 26)->nullable();
            $table->char('print_job_id', 26);
            $table->char('print_agent_id', 26)->nullable();
            $table->unsignedInteger('attempt_number')->default(1);
            $table->string('status', 32)->default('leased'); // leased, completed, failed, expired, started, succeeded
            $table->timestamp('started_at');
            $table->timestamp('ended_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->string('error_code', 64)->nullable();
            $table->text('error_details')->nullable();
            $table->text('error_message')->nullable();
            $table->integer('spooler_job_id')->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('print_job_id')->references('id')->on('print_jobs')->onDelete('cascade');
            $table->foreign('print_agent_id')->references('id')->on('print_agents')->onDelete('set null');

            $table->index(['print_job_id', 'attempt_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('print_job_attempts');
    }
};
